const fs = require('fs');
const path = require('path');

const portfolioDir = './content/portfolio';
const files = fs.readdirSync(portfolioDir)
    .filter(f => f.endsWith('.json') && f !== 'index.json')
    .map(f => f.replace('.json', ''));

fs.writeFileSync(
    path.join(portfolioDir, 'index.json'),
    JSON.stringify(files, null, 2)
);

console.log('Portfolio index gerado:', files);

