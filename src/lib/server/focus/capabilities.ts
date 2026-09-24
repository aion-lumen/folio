/** Execution rights are product facts, never inferred or granted by the model. */
export function capabilityAnswer(message:string):string|undefined {
 if (/\b(korrigier\w*|berichtigen|correct|correction|update.*fact)\b/i.test(message)) return 'Use “Fakt berichtigen” to give the local agent a specific instruction and review its proposal. Only your slide approval changes the selected fact. This conversation alone changes nothing.';
 const english=/\b(can|could|would|will)\s+you\b|^\s*(please\s+)?(send|delete|remove|create|schedule)\b/i.test(message);
 if(english){if(/\b(delete|remove|erase)\b/i.test(message))return 'Deleting is not enabled. Nothing was deleted.';if(/\b(send|submit)\b/i.test(message))return 'I cannot send or submit emails or applications. I can draft text here. Use the handoff button to prepare a reviewable conversation packet.';if(/\b(calendar|event|appointment)\b/i.test(message)&&/\b(create|schedule|add|change)\b/i.test(message))return 'Use “Termin aus Mail” to prepare an event, then approve it on the calendar page. Nothing has been created by this conversation.';}
 const direct=/\b(kannst|könntest|darfst|würdest|wirst)\s+du\b/i.test(message)||/^\s*(?:(?:dann|bitte)\s+)*(sende|schicke|versende|lösche|entferne|erstelle|lege|ändere)\b/i.test(message);
 if(!direct)return;
 if(/\b(löschen|lösche|löschst|löscht|entfernen|entferne|entfernst)\b/i.test(message))return 'Deleting is not enabled for this companion. A spoken instruction does not grant that permission. Nothing was deleted.';
 if(/\b(mail\w*|e-mail\w*|nachricht\w*|bewerbung\w*)\b/i.test(message)&&/\b(versend\w*|send\w*|schick\w*)\b/i.test(message))return 'I cannot send emails or messages to other people. Your consent in this conversation does not enable that capability. I can help draft the text here.';
 if(/\b(kalender\w*|termin\w*)\b/i.test(message)&&/\b(anleg\w*|erstell\w*|änder\w*|vorbereit\w*|eintrag\w*|trag\w*)\b/i.test(message))return 'You can prepare an event using “Termin aus Mail”. Only your explicit approval on the calendar page creates it. A spoken instruction alone does not create an event.';
}
