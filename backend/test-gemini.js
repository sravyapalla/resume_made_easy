// backend/test-gemini.js
// Standalone test script to debug Gemini API issues

require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function testGeminiConnection() {
  console.log('🔍 Testing Gemini API connection...');
  
  if (!process.env.GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY not found in environment variables');
    return;
  }

  console.log('✅ API Key found');
  console.log('📡 Node.js version:', process.version);
  console.log('🌐 Platform:', process.platform);
  
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    console.log('✅ GoogleGenerativeAI instance created');
    
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-1.5-flash',
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 100,
      }
    });
    console.log('✅ Model instance created');
    
    console.log('📡 Sending test request...');
    const startTime = Date.now();
    
    const result = await model.generateContent("Say 'Hello from Node.js!'");
    const response = await result.response;
    const text = response.text();
    
    const endTime = Date.now();
    console.log(`✅ Response received in ${endTime - startTime}ms`);
    console.log('📝 Response:', text);
    
    // Test with LaTeX parsing prompt
    console.log('\n🔍 Testing LaTeX parsing...');
    const latexPrompt = `
You are a resume‐parsing assistant. Given any LaTeX resume template, output a JSON array of user‐fillable fields.
Each item must have:
  • id: machine key (lowercase, no spaces)
  • label: human label
  • default: the default value from the template
Only extract personal data (name, email, phone, education entries, project titles, dates, etc.).

IMPORTANT: Return ONLY valid JSON without any markdown formatting or code blocks.

### TEMPLATE START
\\documentclass{article}
\\newcommand{\\name}{John Doe}
\\newcommand{\\email}{john@example.com}
\\newcommand{\\phone}{555-1234}
\\begin{document}
\\name \\\\
\\email \\\\
\\phone
\\end{document}
### TEMPLATE END
`;

    const latexResult = await model.generateContent(latexPrompt);
    const latexResponse = await latexResult.response;
    const latexText = latexResponse.text();
    
    console.log('📝 LaTeX parsing response:', latexText);
    
    // Try to parse as JSON
    try {
      const parsed = JSON.parse(latexText);
      console.log('✅ JSON parsing successful:', parsed);
    } catch (e) {
      console.log('⚠️ JSON parsing failed, but response received:', e.message);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      code: error.code,
      status: error.status,
      stack: error.stack?.split('\n').slice(0, 5).join('\n')
    });
    
    // Check if it's a network issue
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      console.log('\n🔧 Network troubleshooting:');
      console.log('1. Check your internet connection');
      console.log('2. Try running: ping generativelanguage.googleapis.com');
      console.log('3. Check if you\'re behind a corporate firewall');
      console.log('4. Try using a VPN');
    }
  }
}

// Run the test
testGeminiConnection().catch(console.error);