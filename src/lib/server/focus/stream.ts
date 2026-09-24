/** Only spoken message deltas; reasoning and tool events never reach the client. */
export async function consumeMessages(response:Response,onText:(text:string)=>void){
 const reader=response.body?.getReader();if(!reader)throw new Error('Keine lokale Antwort.');
 const decoder=new TextDecoder();let buffer='',text='',ended=false;
 const consume=(line:string)=>{if(!line.startsWith('data:'))return;const event=JSON.parse(line.slice(5).trim());if(event.type==='error')throw new Error('Lokales Modell meldet einen Fehler.');if(event.type==='chat.end')ended=true;if(event.type==='message.delta'&&typeof event.content==='string'){text+=event.content;onText(event.content);}};
 try{while(true){const part=await reader.read();if(part.done)break;buffer+=decoder.decode(part.value,{stream:true});const lines=buffer.split('\n');buffer=lines.pop()??'';for(const line of lines)consume(line);}if(buffer.trim())consume(buffer);if(!ended||!text.trim())throw new Error('Lokale Antwort unvollständig. Es wurde keine Aktion ausgeführt.');return text;}finally{await reader.cancel().catch(()=>{});}
}
