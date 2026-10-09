import test from 'node:test';
import assert from 'node:assert/strict';
import { markdownHtml } from '../scripts/render-markdown';

test('legal paragraph numbers retain ordered list starts across intervening prose',()=>{
 const html=markdownHtml('1. Första punkten.\n\nMellanliggande stycke.\n\n2. Andra punkten.\n\nLed a) och b).\n\n7. Sjunde punkten.\n8. Åttonde punkten.',{id:'32022R2554'});
 assert.match(html,/<ol start="2">/);
 assert.match(html,/<ol start="7">/);
 assert.match(html,/<li>Åttonde punkten\.<\/li>/);
});
test('rendering keeps legal anchors and value attributes while removing scripts and event handlers',()=>{
 const html=markdownHtml('<a id="article-19"></a>\n\n<li value="4" onclick="alert(1)">Fjärde</li><script>alert(1)</script>',{id:'32022R2554'});
 assert.match(html,/<a id="article-19"><\/a>/);assert.match(html,/<li value="4">/);assert.doesNotMatch(html,/onclick|script|alert/);
});
