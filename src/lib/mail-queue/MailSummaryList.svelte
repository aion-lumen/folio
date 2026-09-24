<script lang="ts">
 import {mailQueueStore} from '$lib/stores/mailQueue.svelte.js';
 import {mailDetailStore} from '$lib/stores/mailDetail.svelte.js';
 import {DOMAIN_LABELS,type DomainKey} from '$lib/util/mail-account.js';
 let limit=$state(80);
 const rows=$derived(mailQueueStore.rows);
</script>
<div class="mobile-mail-list" aria-label="Mails">
 {#each rows.slice(0,limit) as row (row.uid)}<button class:selected={mailDetailStore.selectedUid===row.uid} aria-pressed={mailDetailStore.selectedUid===row.uid} onclick={()=>mailDetailStore.open(row.uid,row)}><small>{row.account} · {new Date(row.received_at).toLocaleDateString('de-CH',{day:'2-digit',month:'short'})}</small><strong>{row.subject||'Ohne Betreff'}</strong><span>{row.from_addr}</span><em>{DOMAIN_LABELS[(row.correction?.corrected_domain??row.domain??'unsorted') as DomainKey]??'Unsortiert'} · {row.reviewed?'Geprüft':'Offen'}</em></button>{:else}<p>Keine Mails für diese Auswahl.</p>{/each}
 {#if rows.length>limit}<button class="more" onclick={()=>limit+=80}>Weitere Mails</button>{/if}
</div>
<style>.mobile-mail-list{height:100%;overflow:auto;background:var(--color-background)}button{display:grid;gap:7px;width:100%;padding:18px 16px;text-align:left;background:var(--color-card);color:var(--color-foreground);border:0;border-bottom:1px solid var(--color-border);cursor:pointer}small,em{font:12px system-ui;color:var(--color-foreground)}strong{font:550 16px/1.4 system-ui;overflow-wrap:anywhere}span{font:12px system-ui;color:var(--color-muted-foreground);overflow-wrap:anywhere}em{font-style:normal}.selected{background:var(--color-muted);box-shadow:inset 3px 0 var(--color-foreground)}.more{text-align:center;background:var(--color-muted)}p{padding:18px}:focus-visible{outline:2px solid var(--color-foreground);outline-offset:-3px}</style>
