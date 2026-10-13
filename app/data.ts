import {demoWorkspaces} from '@/lib/domain/tenancy';
export type Contact = {id:number; name:string; email:string; company:string; phone:string; tags:string[]; status:string; value:number; source:string; owner:string; color:string; workspace:string;workspaceId:string; notes:string[]; customFields?:CustomField[]};
// Free-form text fields of one contact (JSONB custom fields in the target model); no workspace-level field types yet.
export type CustomField={id:string;name:string;value:string};
const people = [
 ['Jan Novák','jan.novak@novakstudio.cz','Novák Studio','Klient','VIP,Newsletter',48500,'Webinář','blue'],
 ['Petra Svobodová','petra@bloomdesign.cz','Bloom Design','Klient','Newsletter,Kurz',12900,'Formulář','pink'],
 ['Tomáš Dvořák','tomas@dvorakpartners.cz','Dvořák & Partners','Zájemce','Webinář,B2B',0,'Webinář','green'],
 ['Lucie Procházková','lucie@atelierlp.cz','Ateliér LP','Klient','VIP,Kurz',26900,'Doporučení','orange'],
 ['Martin Černý','martin@cernydigital.cz','Černý Digital','Zájemce','Newsletter',0,'Chatbot','purple'],
 ['Kateřina Veselá','katerina@kavarnakafe.cz','Kavárna Kafe','Klient','Newsletter,B2B',18400,'Formulář','blue'],
 ['Pavel Horák','pavel@horakstavby.cz','Horák Stavby','Klient','VIP,B2B',62000,'Import','green'],
 ['Anna Němcová','anna@annaceramics.cz','Anna Ceramics','Zájemce','Kurz,Newsletter',4900,'Webinář','pink'],
 ['David Pokorný','david@pokr.cz','POKR Creative','Klient','Newsletter',9900,'Doporučení','purple'],
 ['Tereza Malá','tereza@malastudio.cz','Malá Studio','Odhlášený','B2B',0,'Import','orange'],
 ['Michal Král','michal@kraltech.cz','Král Technologies','Zájemce','Webinář',0,'Chatbot','blue'],
 ['Barbora Fialová','bara@fialovakvetina.cz','Fialová květina','Klient','Kurz,Newsletter',14900,'Formulář','pink']
] as const;
const sampleFields:Record<number,[string,string][]>={
 1:[['Obor','Grafické studio a branding'],['Počet zaměstnanců','8'],['Preferovaný kanál','E-mail, dopoledne'],['Fakturace','Měsíčně, splatnost 14 dní']],
 4:[['Obor','Architektura interiérů'],['Město','Brno'],['Zájem o','Kurz Marketing od základů']],
 7:[['Obor','Stavebnictví'],['Počet poboček','3'],['Rozpočet na marketing','25 000 Kč / měsíc']],
 101:[['Mazlíček','Pes – labradorský retrívr'],['Věrnostní program','Zlatá úroveň']]
};
const fieldsFor=(id:number):CustomField[]=>(sampleFields[id]??[]).map(([name,value],k)=>({id:`cf-${id}-${k+1}`,name,value}));
export const initialContacts:Contact[]=people.map((p,i)=>({id:i+1,name:p[0],email:p[1],company:p[2],status:p[3],tags:p[4].split(','),value:p[5],source:p[6],color:p[7],phone:`+420 7${24+i} 658 ${140+i}`,owner:'Marie Smolková',workspace:'Softema Creative',workspaceId:demoWorkspaces[0].id,notes:i===0?['Zájem o rozšíření spolupráce na e-mailing. Ozvat se s návrhem začátkem října.']:[],customFields:fieldsFor(i+1)}));
initialContacts.push(...initialContacts.slice(0,4).map((c,i)=>({...c,id:101+i,name:['Adam Beneš','Eva Konečná','Ondřej Urban','Klára Marková'][i],email:['adam','eva','ondrej','klara'][i]+'@example.cz',company:'4legs zákazníci',workspace:'4legs.cz',workspaceId:demoWorkspaces[1].id,tags:['Newsletter'],notes:[],customFields:fieldsFor(101+i)})));
export type Block={id:string;type:string;text:string;color?:string;url?:string;align?:'left'|'center'|'right'};
export const defaultBlocks:Block[]=[
 {id:'logo',type:'logo',text:'softema',align:'left'},
 {id:'headline',type:'heading',text:'Podzim přeje\nnovým nápadům.',color:'#24282d',align:'left'},
 {id:'intro',type:'text',text:'Ahoj {{jmeno}},\n\nléto je za námi. Teď je ten správný čas dát vašemu marketingu nový směr. Připravili jsme pro vás inspiraci, praktické tipy a jednu pozvánku, kterou si nechcete nechat ujít.'},
 {id:'highlight',type:'callout',text:'Méně rutiny. Více výsledků.\nObjevte, co dnes dokáže chytrá automatizace.',color:'#fff2eb'},
 {id:'cta',type:'button',text:'Chci načerpat inspiraci',color:'#ed6637',url:'https://softema.cz'},
 {id:'line',type:'divider',text:''},
 {id:'footer',type:'footer',text:'Softema Creative s.r.o. · Olomouc\nTento e-mail dostáváte, protože jste přihlášeni k našemu newsletteru.\nOdhlásit odběr · Upravit předvolby'}
];
export type Campaign={sender?:string;senderEmail?:string;preheader?:string;id:number;name:string;subject:string;status:string;audience:string;recipients:number;date:string;open:string;click:string;workspace:string;workspaceId:string;blocks:Block[]};
export const initialCampaigns:Campaign[]=[
 {id:1,name:'Podzimní inspirace pro váš marketing',subject:'Podzim přeje novým nápadům 🍂',status:'Naplánováno',audience:'Odběratelé newsletteru',recipients:2486,date:'28. 9. 2026 · 9:00',open:'—',click:'—'},
 {id:2,name:'Jak na marketing, který přináší výsledky',subject:'3 kroky k lepším výsledkům',status:'Odesláno',audience:'Všechny aktivní kontakty',recipients:3842,date:'22. 9. 2026 · 10:00',open:'42,8 %',click:'6,4 %'},
 {id:3,name:'Pozvánka: AI v marketingu bez omáčky',subject:'Rezervujte si místo na našem webináři',status:'Odesláno',audience:'Zájemci o webináře',recipients:1860,date:'18. 9. 2026 · 9:00',open:'48,2 %',click:'8,1 %'},
 {id:4,name:'Co je nového v Softemě? Září 2026',subject:'Zářijové novinky jsou tady',status:'Odesláno',audience:'Odběratelé newsletteru',recipients:2431,date:'10. 9. 2026 · 9:00',open:'39,6 %',click:'5,2 %'},
 {id:5,name:'Váš první krok k lepšímu e-mailingu',subject:'Začněte posílat e-maily, které lidé čtou',status:'Koncept',audience:'Nové kontakty',recipients:328,date:'Upraveno 25. 9. 2026',open:'—',click:'—'},
 {id:6,name:'Děkujeme za skvělý Business Fest!',subject:'Tohle byl náš první Business Fest',status:'Odesláno',audience:'Účastníci Business Festu',recipients:284,date:'4. 9. 2026 · 10:00',open:'68,3 %',click:'12,6 %'}
].map(c=>({...c,workspace:'Softema Creative',workspaceId:demoWorkspaces[0].id,blocks:defaultBlocks.map(b=>({...b}))}));
initialCampaigns.push({id:101,name:'Podzimní péče o vaše čtyřnohé parťáky',subject:'Novinky pro vaše mazlíčky',status:'Odesláno',audience:'Odběratelé newsletteru',recipients:1450,date:'23. 9. 2026 · 8:00',open:'38,4 %',click:'4,8 %',workspace:'4legs.cz',workspaceId:demoWorkspaces[1].id,blocks:defaultBlocks.map(b=>({...b}))});
export const fmt=(v:number)=>new Intl.NumberFormat('cs-CZ').format(v);
export const money=(v:number)=>fmt(v)+' Kč';
export const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export const navItems=[['prehled','Přehled'],['kontakty','Kontakty'],['kampane','Kampaně'],['automatizace','Automatizace'],['ai-agenti','AI agenti'],['platby','Platby'],['kurzy','Kurzy a komunita'],['webinare','Webináře'],['chatbot','Chatbot'],['nastaveni','Nastavení']];
