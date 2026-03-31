import fs from 'fs';
const file = 'src/app/page.tsx';
let content = fs.readFileSync(file, 'utf8');

// The line is:
// const { state: revisedState, setOriginalResult, reset: resetRevised } = useRevisedAnalysisState();

// Change it to:
// const revisedAnalysis = useRevisedAnalysisState();
// const { state: revisedState, setOriginalResult, reset: resetRevised } = revisedAnalysis;

content = content.replace(
  'const { state: revisedState, setOriginalResult, reset: resetRevised } = useRevisedAnalysisState();',
  'const revisedAnalysis = useRevisedAnalysisState();\n  const { state: revisedState, setOriginalResult, reset: resetRevised } = revisedAnalysis;'
);

content = content.replace(
  '<ReviewPanel result={result} revisedState={revisedState} />',
  '<ReviewPanel result={result} revisedState={revisedAnalysis} />'
);

fs.writeFileSync(file, content);
