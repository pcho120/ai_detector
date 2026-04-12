/**
 * Creates a .docx fixture file with AI-generated essay text for E2E testing.
 * Uses jszip (available as transitive dep of mammoth) to create a valid .docx.
 *
 * Run: node scripts/create-ai-essay-fixture.mjs
 */
import { createRequire } from 'module';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const JSZip = require('jszip');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ~500 words of clearly AI-generated academic prose
const essayText = `The Impact of Artificial Intelligence on Modern Education

In recent years, artificial intelligence has emerged as a transformative force in the field of education, fundamentally reshaping how knowledge is disseminated and acquired. Furthermore, it is evident that the integration of AI-powered tools into educational institutions has created unprecedented opportunities for personalized learning experiences. The research demonstrates that adaptive learning platforms, powered by sophisticated machine learning algorithms, can tailor educational content to individual student needs with remarkable precision.

Moreover, the implementation of AI in educational settings has yielded significant improvements in student engagement and academic outcomes. Studies have consistently shown that AI-driven tutoring systems can identify knowledge gaps and provide targeted remediation in ways that traditional classroom instruction cannot achieve. It is worth noting that these technological advancements have not only enhanced the learning process but have also streamlined administrative tasks, allowing educators to focus more on meaningful student interactions.

The proliferation of natural language processing technologies has further revolutionized the educational landscape. Automated essay scoring systems and intelligent writing assistants have made it possible to provide immediate, constructive feedback to students at scale. In addition, chatbot-based learning companions have demonstrated considerable promise in supporting students outside of regular classroom hours, effectively extending the reach of educational support systems.

However, it is important to acknowledge that the integration of artificial intelligence in education is not without its challenges and ethical considerations. Questions regarding data privacy, algorithmic bias, and the potential displacement of human educators have generated significant debate among stakeholders in the educational community. The research suggests that a balanced approach, one that leverages the strengths of AI while preserving the irreplaceable human elements of teaching, is essential for optimal educational outcomes.

Furthermore, the digital divide remains a pressing concern, as access to AI-powered educational tools is not uniformly distributed across socioeconomic groups. It can be argued that without deliberate efforts to ensure equitable access, the adoption of AI in education may inadvertently exacerbate existing inequalities rather than mitigate them. Policymakers and educational leaders must therefore prioritize inclusive implementation strategies.

Looking ahead, the trajectory of AI in education appears poised for continued expansion and sophistication. Emerging technologies such as generative AI, augmented reality, and advanced data analytics hold tremendous potential for creating immersive and highly effective learning environments. The evidence indicates that institutions that embrace these innovations thoughtfully and strategically will be best positioned to prepare students for the demands of an increasingly technology-driven world.

In conclusion, artificial intelligence represents both a remarkable opportunity and a significant responsibility for the education sector. The successful integration of AI into educational practice requires careful consideration of pedagogical principles, ethical guidelines, and the diverse needs of learners. It is imperative that all stakeholders collaborate to harness the transformative potential of AI while safeguarding the fundamental values of education. The future of learning depends on our collective ability to navigate this complex and rapidly evolving technological landscape with wisdom and foresight.`;

// Minimal .docx structure (OOXML)
const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

// Convert essay text into paragraphs
const paragraphs = essayText.split('\n\n').filter(p => p.trim());
const paragraphsXml = paragraphs.map(p => {
  const escaped = p.trim()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<w:p><w:r><w:t xml:space="preserve">${escaped}</w:t></w:r></w:p>`;
}).join('\n');

const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraphsXml}
  </w:body>
</w:document>`;

const wordRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`;

async function main() {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', contentTypesXml);
  zip.file('_rels/.rels', relsXml);
  zip.file('word/document.xml', documentXml);
  zip.file('word/_rels/document.xml.rels', wordRelsXml);

  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  const outPath = join(__dirname, '..', 'e2e', 'fixtures', 'ai-generated-essay.docx');
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, buffer);
  console.log(`Created: ${outPath} (${buffer.length} bytes)`);
}

main().catch(console.error);
