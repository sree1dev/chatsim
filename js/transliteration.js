/* Minimal Manglish → Malayalam transliteration (offline, Mozhi-like). */
window.transliterateManglish = (input)=>{
  let s=(input||"").replace(/\r/g,""); if(!s) return "";
  const words=s.split(/(\s+)/);
  return words.map(t=>/\s+/.test(t)?t:transliterateWord(t)).join("");
};
const V={"aa":"ആ","a":"അ","ee":"ഈ","ii":"ഈ","e":"എ","i":"ഇ","oo":"ഊ","uu":"ഊ","o":"ഒ","u":"ഉ","ai":"ഐ","au":"ഔ","ow":"ഔ","ae":"ഏ","ea":"ഈ","ou":"ഔ"};
const VS={"aa":"ാ","a":"","ee":"ീ","ii":"ീ","e":"െ","i":"ി","oo":"ൂ","uu":"ൂ","o":"ൊ","u":"ു","ai":"ൈ","au":"ൗ","ow":"ൗ","ae":"േ","ou":"ൗ"};
const CL=[["ksh","ക്ഷ"],["ng","ങ"],["nj","ഞ"],["ch","ച"],["sh","ശ"],["ss","ശ"],["zh","ഴ"],["rr","റ"],["gn","ങ"],["tr","ത്ര"],["kh","ഖ"],["gh","ഘ"],["ph","ഫ"],["bh","ഭ"],["dh","ധ"],["th","ത"],["tt","ട്ട"],["dd","ഡ്ഡ"],["ny","ഞ"]];
const C={"k":"ക","g":"ഗ","c":"ക","j":"ജ","t":"ട","d":"ഡ","n":"ന","p":"പ","b":"ബ","m":"മ","y":"യ","r":"ര","l":"ല","v":"വ","w":"വ","s":"സ","h":"ഹ","x":"ക്സ","f":"ഫ","q":"ക","z":"സ","ḷ":"ള","ḻ":"ഴ","ṇ":"ണ","ṭ":"ട","ḍ":"ഡ"};
const VIR="്";
function transliterateWord(w){
  const lw=w.toLowerCase();
  for(const k of Object.keys(V).sort((a,b)=>b.length-a.length)){
    if(lw.startsWith(k)){ return V[k]+spell(lw.slice(k.length)); }
  }
  return spell(lw);
}
function spell(lw){
  let i=0,out="";
  while(i<lw.length){
    const ch=lw[i];
    if(/[^a-zA-Z]/.test(ch)){ out+=lw[i]; i++; continue; }
    let hit=false;
    for(const [pat,g] of CL){
      if(lw.startsWith(pat,i)){ const [vs,c]=readVS(lw,i+pat.length); out+=g+(vs??""); i+=pat.length+c; hit=true; break; }
    }
    if(hit) continue;
    if(C[lw[i]]){ const [vs,c]=readVS(lw,i+1); out+=C[lw[i]]+(vs??""); i+=1+c; continue; }
    let v=false;
    for(const k of Object.keys(V).sort((a,b)=>b.length-a.length)){
      if(lw.startsWith(k,i)){ out+=V[k]; i+=k.length; v=true; break; }
    }
    if(v) continue;
    out+=lw[i]; i++;
  }
  if(out && endsBare(out)) out+=VIR;
  return out;
}
function readVS(s,pos){
  for(const k of Object.keys(VS).sort((a,b)=>b.length-a.length)){
    if(s.startsWith(k,pos)) return [VS[k],k.length];
  }
  return ["",0];
}
function endsBare(txt){
  if(!txt) return false; const last=txt[txt.length-1]; if(last===VIR) return false;
  const code=last.charCodeAt(0); const mal=(code>=0x0D00 && code<=0x0D7F);
  if(!mal) return false;
  const vowels="അആഇഈഉഊഎഏഐഒഓഔ"; const signs="ാിീുൂെേൈൊോൗ";
  if(signs.includes(last)) return false; if(vowels.includes(last)) return false;
  return true;
}
