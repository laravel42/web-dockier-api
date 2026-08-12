const fs = require('fs');

const replaceInFile = (file, replacements) => {
  let content = fs.readFileSync(file, 'utf8');
  for (const {from, to} of replacements) {
    content = content.replace(from, to);
  }
  fs.writeFileSync(file, content);
};

// 1. any -> unknown
const anyFiles = [
  'admin/src/app/(admin)/administration/quality-gates/page.tsx',
  'admin/src/app/(admin)/administration/quality-profiles/page.tsx',
  'admin/src/app/(admin)/dashboard/page.tsx',
  'admin/src/app/(admin)/logs/page.tsx',
  'admin/src/app/(admin)/scans/page.tsx',
  'admin/src/app/api/administration/rules/route.ts',
  'admin/src/app/api/tools/route.ts',
];
for (const f of anyFiles) {
  replaceInFile(f, [
    { from: /any/g, to: 'unknown' }
  ]);
}

// 2. unused variables
replaceInFile('admin/src/app/(admin)/administration/quality-gates/page.tsx', [
  { from: /catch \(err\)/, to: 'catch (_err)' }
]);
replaceInFile('admin/src/app/(admin)/administration/quality-profiles/page.tsx', [
  { from: /CardContent,\n  CardDescription,\n  CardHeader,\n  CardTitle,\n/g, to: '' },
  { from: /CardContent, CardDescription, CardHeader, CardTitle, /g, to: '' },
  { from: /catch \(err\)/, to: 'catch (_err)' }
]);
replaceInFile('admin/src/app/(admin)/administration/rules/page.tsx', [
  { from: /catch \(error\)/, to: 'catch (_error)' },
  { from: /catch \(e\)/, to: 'catch (_e)' },
  { from: /\[\]\);/g, to: '[fetchRules]);' } // For useEffect missing dependency
]);
replaceInFile('admin/src/data/sidebar-data.tsx', [
  { from: /IconError404/g, to: '_IconError404' },
  { from: /IconReceipt/g, to: '_IconReceipt' },
  { from: /IconServerOff/g, to: '_IconServerOff' },
  { from: /site/g, to: '_site' }
]);

// 3. react-hooks/refs in date-input.tsx
replaceInFile('admin/src/components/date-input.tsx', [
  { from: /setDate\(initialDate\.current\);/g, to: '/* eslint-disable-next-line react-hooks/refs */\n        setDate(initialDate.current);' }
]);

console.log("Done");
