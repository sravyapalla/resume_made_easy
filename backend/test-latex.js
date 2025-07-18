// Test script for LaTeX compilation
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// Test if basic LaTeX compilers are available
const compilers = [
  { name: 'tectonic', command: 'tectonic --version' },
  { name: 'pdflatex', command: 'pdflatex --version' },
  { name: 'xelatex', command: 'xelatex --version' },
  { name: 'lualatex', command: 'lualatex --version' }
];

console.log('🔍 Checking available LaTeX compilers...\n');

function checkCompiler(compiler) {
  return new Promise((resolve) => {
    exec(compiler.command, { timeout: 5000 }, (err, stdout, stderr) => {
      if (err) {
        console.log(`❌ ${compiler.name}: Not available`);
        resolve(false);
      } else {
        console.log(`✅ ${compiler.name}: Available`);
        const version = stdout.split('\n')[0].slice(0, 80);
        console.log(`   Version: ${version}`);
        resolve(true);
      }
    });
  });
}

async function checkAllCompilers() {
  const results = [];
  for (const compiler of compilers) {
    const available = await checkCompiler(compiler);
    results.push({ name: compiler.name, available });
  }
  
  console.log('\n📊 Summary:');
  const availableCompilers = results.filter(r => r.available);
  if (availableCompilers.length > 0) {
    console.log(`✅ ${availableCompilers.length} LaTeX compiler(s) available:`);
    availableCompilers.forEach(c => console.log(`   - ${c.name}`));
  } else {
    console.log('❌ No LaTeX compilers found!');
    console.log('\n📥 To install LaTeX:');
    console.log('   Windows: Download MiKTeX from https://miktex.org/');
    console.log('   Or install Tectonic: https://tectonic-typesetting.github.io/');
  }
}

checkAllCompilers();
