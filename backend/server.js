// backend/server.js
require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const fs      = require('fs');
const path    = require('path');
const os      = require('os');
const { exec } = require('child_process');
const { GoogleGenerativeAI } = require('@google/generative-ai');

if (!process.env.GEMINI_API_KEY) {
  console.error("❌  Please set GEMINI_API_KEY in your .env");
  process.exit(1);
}

console.log('🔑 API Key loaded');
console.log('📡 Node.js version:', process.version);
console.log('🌐 Platform:', process.platform);

let genAI;
try {
  genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  console.log('✅ GoogleGenerativeAI instance created successfully');
} catch (error) {
  console.error('❌ Failed to create GoogleGenerativeAI instance:', error);
  process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '200kb' }));

// 60s timeout on all requests
app.use((req, res, next) => {
  req.setTimeout(60000);
  next();
});

// Safely delete the temp directory (with retries on Windows locks)
function safeRemoveDir(dirPath) {
  try {
    if (fs.existsSync(dirPath)) {
      const maxRetries = 3;
      let retries = 0;
      const attempt = () => {
        try {
          fs.rmSync(dirPath, { recursive: true, force: true });
          console.log(`🧹 Cleaned up ${dirPath}`);
        } catch (err) {
          if (++retries < maxRetries && err.code === 'ENOTEMPTY') {
            console.log(`⚠️  Retry cleanup (${retries}/${maxRetries})`);
            setTimeout(attempt, 1000);
          } else {
            console.warn(`⚠️  Could not remove ${dirPath}:`, err.message);
          }
        }
      };
      setTimeout(attempt, 500);
    }
  } catch (err) {
    console.warn(`⚠️ Cleanup warning:`, err.message);
  }
}

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Gemini connectivity test
app.get('/test-gemini', async (_req, res) => {
  try {
    console.log('🔍 Testing Gemini API...');
    const model = genAI.getGenerativeModel({
      model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
      generationConfig: { temperature: 0, maxOutputTokens: 8192 }
    });

    const start = Date.now();
    const result = await model.generateContent("Say 'Hello, connection test successful!'");
    const text = (await result.response).text();
    console.log(`✅ Gemini responded in ${Date.now() - start}ms`);

    res.json({ success: true, response: text, responseTime: `${Date.now() - start}ms` });
  } catch (err) {
    console.error('❌ Gemini test failed:', err);
    res.status(500).json({ success: false, error: err.message, details: err });
  }
});

// LaTeX template validation endpoint
app.post('/validate-latex', express.text({ type: 'text/plain', limit: '200kb' }), (req, res) => {
  const latex = req.body?.trim();
  if (!latex) {
    return res.status(400).json({ error: 'No LaTeX provided' });
  }

  const validation = {
    valid: true,
    warnings: [],
    errors: [],
    structure: {
      hasDocumentClass: latex.includes('\\documentclass'),
      hasBeginDocument: latex.includes('\\begin{document}'),
      hasEndDocument: latex.includes('\\end{document}'),
      hasNewCommands: /\\newcommand/.test(latex),
      hasDefCommands: /\\def\\/.test(latex)
    }
  };

  // Check required structure
  if (!validation.structure.hasDocumentClass) {
    validation.errors.push('Missing \\documentclass declaration');
    validation.valid = false;
  }
  
  if (!validation.structure.hasBeginDocument) {
    validation.errors.push('Missing \\begin{document}');
    validation.valid = false;
  }
  
  if (!validation.structure.hasEndDocument) {
    validation.errors.push('Missing \\end{document}');
    validation.valid = false;
  }

  // Check for common issues
  if (!validation.structure.hasNewCommands && !validation.structure.hasDefCommands) {
    validation.warnings.push('No \\newcommand or \\def found - template might not have fillable fields');
  }

  // Check for unbalanced braces
  const openBraces = (latex.match(/\{/g) || []).length;
  const closeBraces = (latex.match(/\}/g) || []).length;
  if (openBraces !== closeBraces) {
    validation.warnings.push(`Unbalanced braces: ${openBraces} open, ${closeBraces} close`);
  }

  console.log(`🔍 LaTeX validation: ${validation.valid ? 'PASS' : 'FAIL'}`);
  res.json(validation);
});

// 1) Upload TeX → extract form fields via Gemini
app.post(
  '/upload-tex',
  express.text({ type: 'text/plain', limit: '200kb' }),
  async (req, res) => {
    const latex = req.body?.trim();
    if (!latex) {
      return res.status(400).json({ error: 'No LaTeX provided' });
    }

    // Basic validation
    if (!latex.includes('\\documentclass')) {
      return res.status(400).json({
        error: 'Invalid LaTeX template: Missing \\documentclass',
        troubleshooting: [
          'Make sure your template starts with \\documentclass{...}',
          'Include complete LaTeX document structure',
          'Check that you pasted the entire template'
        ]
      });
    }

    const prompt = `
You are a LaTeX resume parsing assistant. Analyze this LaTeX template and extract ALL user-fillable fields.

Look for these patterns:
1. \\newcommand{\\fieldname}{default value}
2. \\def\\fieldname{default value}
3. {PLACEHOLDER} or {fieldname}
4. \\VAR{fieldname}
5. <<fieldname>> or [fieldname]
6. Any obvious placeholder text like "Your Name", "your.email@domain.com", etc.

For each field found, create a JSON object with:
- id: machine-readable key (lowercase, underscores for spaces, no special chars)
- label: human-readable label (proper case, spaces allowed)
- default: the current value/placeholder text

Return ONLY a valid JSON array. Be comprehensive - extract every fillable field you can identify.

Example output:
[
  {"id": "name", "label": "Full Name", "default": "John Doe"},
  {"id": "email", "label": "Email Address", "default": "john@example.com"},
  {"id": "phone", "label": "Phone Number", "default": "(555) 123-4567"}
]

### LATEX TEMPLATE START ###
${latex}
### LATEX TEMPLATE END ###

Return JSON array:`.trim();

    try {
      console.log('🤖 Calling Gemini for enhanced schema extraction...');
      const model = genAI.getGenerativeModel({
        model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
        generationConfig: { 
          temperature: 0.1, 
          maxOutputTokens: 4000,
          topP: 0.8,
          topK: 40
        }
      });

      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout after 45s')), 45000)
      );
      
      const result = await Promise.race([model.generateContent(prompt), timeout]);
      const raw = (await result.response).text();

      console.log('🔍 Raw AI response preview:', raw.slice(0, 200) + '...');

      let cleaned = raw.trim();
      
      // Remove markdown formatting if present
      cleaned = cleaned
        .replace(/^.*?```json\s*/s, '')
        .replace(/\s*```.*$/s, '')
        .replace(/^`+|`+$/g, '')
        .trim();

      // Handle case where AI adds explanation before JSON
      const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        cleaned = jsonMatch[0];
      }

      // Validate JSON structure
      if (!cleaned.startsWith('[') || !cleaned.endsWith(']')) {
        console.warn('⚠️ Invalid JSON structure from AI');
        return res.status(500).json({
          error: 'AI returned invalid JSON format',
          raw: raw.slice(0, 500) + '...',
          cleaned: cleaned.slice(0, 500) + '...',
          troubleshooting: [
            'Try a simpler LaTeX template',
            'Make sure your template has clear placeholder patterns',
            'Check that the template is valid LaTeX syntax'
          ]
        });
      }

      let schema;
      try {
        schema = JSON.parse(cleaned);
      } catch (parseErr) {
        console.error('❌ JSON parse error:', parseErr);
        return res.status(500).json({
          error: 'Failed to parse AI response as JSON',
          parseError: parseErr.message,
          cleaned: cleaned.slice(0, 500) + '...',
          troubleshooting: [
            'The AI response was malformed',
            'Try uploading the template again',
            'Simplify your LaTeX template structure'
          ]
        });
      }

      if (!Array.isArray(schema)) {
        return res.status(500).json({
          error: 'Expected JSON array from AI',
          receivedType: typeof schema,
          troubleshooting: [
            'AI returned unexpected format',
            'Try a different template or retry the request'
          ]
        });
      }

      // Validate and clean schema items
      const validatedSchema = schema.filter(item => {
        return item && 
               typeof item === 'object' && 
               typeof item.id === 'string' && 
               typeof item.label === 'string' &&
               item.id.length > 0 &&
               item.label.length > 0;
      }).map(item => ({
        id: item.id.toLowerCase().replace(/[^a-z0-9_]/g, ''),
        label: item.label.trim(),
        default: String(item.default || '').trim()
      }));

      if (validatedSchema.length === 0) {
        return res.status(400).json({
          error: 'No valid fields found in template',
          rawSchema: schema,
          troubleshooting: [
            'Your template might not have clear placeholder patterns',
            'Try adding \\newcommand definitions for fillable fields',
            'Make sure placeholders are clearly marked'
          ]
        });
      }

      console.log(`📋 Successfully parsed ${validatedSchema.length} fields:`, 
        validatedSchema.map(f => f.id).join(', '));
      
      res.json({ 
        schema: validatedSchema,
        meta: {
          totalFound: schema.length,
          validFields: validatedSchema.length,
          extractedAt: new Date().toISOString()
        }
      });

    } catch (err) {
      console.error('❌ AI extraction error:', err);
      
      let troubleshooting = [
        'Check your internet connection',
        'Verify GEMINI_API_KEY is set correctly',
        'Try a simpler LaTeX template',
        'Make sure the template is complete and valid'
      ];

      if (err.message.includes('Timeout')) {
        troubleshooting.unshift('Request timed out - try a shorter template');
      } else if (err.message.includes('API')) {
        troubleshooting.unshift('Gemini API error - check your API key and quota');
      }

      res.status(500).json({ 
        error: `AI extraction failed: ${err.message}`,
        details: err.stack?.split('\n').slice(0, 3),
        troubleshooting: troubleshooting
      });
    }
  }
);

// Helper function to escape LaTeX special characters
function escapeLatex(text) {
  if (typeof text !== 'string') return text;
  return text
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/[{}]/g, '\\$&')
    .replace(/[$&%#^_~]/g, '\\$&')
    .replace(/\textbackslash\{\}/g, '\\textbackslash{}');
}

// Helper function to try multiple LaTeX compilers
function tryCompileLatex(texPath, outputDir, callback) {
  const pdfPath = path.join(outputDir, 'resume.pdf');
  const logPath = path.join(outputDir, 'resume.log');
  
  // Use the local tectonic.exe first, then try system installations
  const tectonicPath = path.join(__dirname, 'tectonic.exe');
  const compilers = [
    {
      name: 'tectonic-local',
      command: `"${tectonicPath}" --outdir "${outputDir}" "${texPath}"`,
      description: 'Tectonic (local executable)'
    },
    {
      name: 'tectonic-system',
      command: `tectonic --outdir "${outputDir}" "${texPath}"`,
      description: 'Tectonic (system installation)'
    },
    {
      name: 'pdflatex',
      command: `pdflatex -output-directory="${outputDir}" -interaction=nonstopmode "${texPath}"`,
      description: 'pdfLaTeX (traditional)'
    }
  ];

  let attempts = [];
  
  function tryNextCompiler(index = 0) {
    if (index >= compilers.length) {
      return callback(new Error('All LaTeX compilers failed'), attempts);
    }

    const compiler = compilers[index];
    console.log(`🔨 Trying ${compiler.description}...`);
    
    exec(compiler.command, { 
      timeout: 45000,  // Increase timeout for package downloads
      cwd: outputDir,
      env: { ...process.env, PATH: process.env.PATH }
    }, (err, stdout, stderr) => {
      let fullLog = stdout + stderr;
      
      // Try to read log file for more details
      if (fs.existsSync(logPath)) {
        try {
          const logContent = fs.readFileSync(logPath, 'utf8');
          fullLog = logContent + '\n' + fullLog;
        } catch (e) {
          // Log file might be locked, ignore
        }
      }

      attempts.push({
        compiler: compiler.name,
        command: compiler.command,
        success: !err && fs.existsSync(pdfPath),
        error: err?.message,
        log: fullLog.slice(-3000) // Keep last 3000 chars
      });

      if (!err && fs.existsSync(pdfPath)) {
        console.log(`✅ Successfully compiled with ${compiler.name}`);
        return callback(null, attempts);
      } else {
        console.log(`❌ ${compiler.name} failed:`, err?.message || 'Unknown error');
        // Clean up failed artifacts before trying next compiler
        try {
          if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
        } catch (e) { /* ignore */ }
        
        setTimeout(() => tryNextCompiler(index + 1), 1000);
      }
    });
  }

  tryNextCompiler();
}

// 2) Generate PDF from template + values
app.post('/generate-pdf', (req, res) => {
  const { template, values } = req.body;
  if (typeof template !== 'string' || typeof values !== 'object') {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  console.log('📄 Generating PDF...');
  let processed = template;

  try {
    // Enhanced value injection with multiple patterns
    for (const [key, val] of Object.entries(values)) {
      const escKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const safeVal = escapeLatex(String(val || ''));

      // Pattern 1: \newcommand{\key}{value}
      const newCmdRegex = new RegExp(`(\\\\newcommand\\{\\\\${escKey}\\}\\{)[^}]*?(\\})`, 'g');
      processed = processed.replace(newCmdRegex, `$1${safeVal}$2`);

      // Pattern 2: \def\key{value}
      const defRegex = new RegExp(`(\\\\def\\\\${escKey}\\{)[^}]*?(\\})`, 'g');
      processed = processed.replace(defRegex, `$1${safeVal}$2`);

      // Pattern 3: Direct placeholder replacement
      const placeholderRegex = new RegExp(`\\{${escKey}\\}`, 'g');
      processed = processed.replace(placeholderRegex, safeVal);

      // Pattern 4: \VAR{key} style
      const varRegex = new RegExp(`\\\\VAR\\{${escKey}\\}`, 'g');
      processed = processed.replace(varRegex, safeVal);

      // Pattern 5: <<key>> style placeholders
      const bracketRegex = new RegExp(`<<${escKey}>>`, 'g');
      processed = processed.replace(bracketRegex, safeVal);
    }

    // Ensure document has proper structure
    if (!processed.includes('\\documentclass')) {
      return res.status(400).json({
        error: 'Invalid LaTeX template: Missing \\documentclass',
        troubleshooting: [
          'Make sure your template starts with \\documentclass{...}',
          'Include \\begin{document} and \\end{document}',
          'Check that the template is complete LaTeX code'
        ]
      });
    }

    if (!processed.includes('\\begin{document}')) {
      return res.status(400).json({
        error: 'Invalid LaTeX template: Missing \\begin{document}',
        troubleshooting: [
          'Add \\begin{document} after your preamble',
          'Make sure to include \\end{document} at the end',
          'Verify the template structure is correct'
        ]
      });
    }

  } catch (error) {
    return res.status(500).json({
      error: 'Error processing template',
      details: error.message,
      troubleshooting: [
        'Check if all placeholders are properly formatted',
        'Verify that special characters are handled correctly',
        'Make sure the template syntax is valid'
      ]
    });
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'latex-'));
  const texPath = path.join(tmp, 'resume.tex');
  
  try {
    fs.writeFileSync(texPath, processed, 'utf8');
  } catch (error) {
    safeRemoveDir(tmp);
    return res.status(500).json({
      error: 'Failed to write LaTeX file',
      details: error.message
    });
  }

  console.log(`📁 Working directory: ${tmp}`);
  console.log(`📝 LaTeX file: ${texPath}`);

  tryCompileLatex(texPath, tmp, (err, attempts) => {
    const pdfPath = path.join(tmp, 'resume.pdf');
    
    if (err || !fs.existsSync(pdfPath)) {
      console.error('❌ All LaTeX compilation attempts failed');
      
      const lastAttempt = attempts[attempts.length - 1];
      const troubleshooting = [
        'Install a LaTeX distribution (TeX Live, MiKTeX, or Tectonic)',
        'Make sure LaTeX executables are in your system PATH',
        'Check that all required packages are available',
        'Verify your template syntax is correct',
        'Try simplifying your template to test basic functionality'
      ];

      // Add specific troubleshooting based on error patterns
      if (lastAttempt?.log) {
        if (lastAttempt.log.includes('! LaTeX Error')) {
          troubleshooting.unshift('LaTeX syntax error detected - check your template');
        }
        if (lastAttempt.log.includes('File') && lastAttempt.log.includes('not found')) {
          troubleshooting.unshift('Missing LaTeX package - install required packages');
        }
        if (lastAttempt.log.includes('Emergency stop')) {
          troubleshooting.unshift('Critical LaTeX error - check document structure');
        }
      }

      safeRemoveDir(tmp);
      return res.status(500).json({
        error: 'PDF generation failed with all compilers',
        attempts: attempts,
        troubleshooting: troubleshooting,
        technical: {
          workingDir: tmp,
          processors: attempts.map(a => a.compiler)
        }
      });
    }

    console.log('✅ PDF generated successfully');
    console.log(`📊 Used ${attempts[attempts.length - 1]?.compiler} compiler`);
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="resume.pdf"');
    
    res.sendFile(pdfPath, (sendErr) => {
      if (sendErr) {
        console.error('❌ Error sending PDF:', sendErr);
      }
      safeRemoveDir(tmp);
    });
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🛠  Backend listening on http://localhost:${PORT}`);
  console.log(`🔍 Test Gemini: http://localhost:${PORT}/test-gemini`);
});
