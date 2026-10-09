import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import katex from 'katex';
import { BASE } from '../src/views';
export function markdownHtml(md:string,d:any){
  const math:string[]=[];
  md=md.replace(/^# FFFS[^\n]*\n\n> Maskinextraherad läsutgåva\.[\s\S]*?\n---\n/,'');
  md=md.replace(/\$\$([\s\S]*?)\$\$/g,(_,tex)=>{const id=math.push(katex.renderToString(tex.trim(),{displayMode:true,throwOnError:false,strict:'ignore',trust:false}))-1;return `\n\nMATHBLOCK${id}END\n\n`});
  md=md.replace(/<!-- PDF page (\d+) -->/g,(_,page)=>`\n\n<a class="pdf-page-link" href="${BASE}pdf/${d.id}.pdf#page=${page}">PDF s. ${page}</a>\n\n`);
  let html=marked.parse(md,{gfm:true,breaks:false}) as string;
  html=sanitizeHtml(html,{allowedTags:[...sanitizeHtml.defaults.allowedTags,'img','details','summary','span'],allowedAttributes:{...sanitizeHtml.defaults.allowedAttributes,a:['href','id','class','title'],img:['src','alt','width','height','loading'],span:['class'],ol:['start','type'],li:['value'],th:['colspan','rowspan'],td:['colspan','rowspan']},allowedSchemes:['https','http','mailto'],transformTags:{a:(tag,attribs)=>({tagName:tag,attribs:{...attribs,...(attribs.href?.startsWith('/pdf/')||attribs.href?.startsWith('/images/')?{href:BASE+attribs.href.slice(1)}:{})}}),img:(tag,attribs)=>({tagName:tag,attribs:{...attribs,src:attribs.src?.startsWith('/images/')?BASE+attribs.src.slice(1):attribs.src,loading:'lazy'}})}});
  html=html.replace(/<p>MATHBLOCK(\d+)END<\/p>/g,(_,i)=>math[Number(i)]).replace(/MATHBLOCK(\d+)END/g,(_,i)=>math[Number(i)]);
  return html;
}
