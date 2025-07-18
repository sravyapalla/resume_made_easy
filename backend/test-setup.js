// Quick test script to verify Tectonic setup
const { exec } = require('child_process');
const path = require('path');

const tectonicPath = path.join(__dirname, 'tectonic.exe');

console.log('🔍 Testing Tectonic setup...');
console.log(`📍 Tectonic path: ${tectonicPath}`);

exec(`"${tectonicPath}" --version`, (err, stdout, stderr) => {
  if (err) {
    console.error('❌ Error:', err.message);
    return;
  }
  
  console.log('✅ Tectonic version:', stdout.trim());
  console.log('🎉 Tectonic is ready to use!');
  
  // Test compilation with our sample template
  console.log('\n🔨 Testing compilation...');
  exec(`"${tectonicPath}" --outdir . test_template.tex`, (compileErr, compileOut, compileErr2) => {
    if (compileErr) {
      console.error('❌ Compilation failed:', compileErr.message);
      console.log('📝 Output:', compileOut);
      console.log('📝 Errors:', compileErr2);
    } else {
      console.log('✅ Compilation successful!');
      console.log('📄 PDF should be generated as test_template.pdf');
    }
  });
});
