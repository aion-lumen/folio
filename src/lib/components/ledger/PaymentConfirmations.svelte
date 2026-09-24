<script lang="ts">
 import { CheckCircle2, FileCheck2 } from 'lucide-svelte';
 import type { PaymentConfirmedMemory } from '$lib/server/memory/payment-confirmation.js';
 let { payments }: { payments: PaymentConfirmedMemory[] } = $props();
 const date = (value: string) => new Date(value + 'T12:00:00').toLocaleDateString('de-CH');
</script>

{#if payments.length}
 <section class="payments" aria-label="Bankbestätigte Zahlungen">
  <header><CheckCircle2 size={19}/><h2>Automatisch abgeglichen</h2><span>{payments.length}</span></header>
  {#each payments as payment}
   <article id={`payment-${payment.fact_id}`}>
    <div class="main"><div><strong>{payment.title}</strong><p>Bezahlt am {date(payment.paid_at)} · Lastschrift</p></div><b>{new Intl.NumberFormat('de-CH',{style:'currency',currency:payment.currency}).format(Number(payment.amount))}</b></div>
    <p class="done"><FileCheck2 size={16}/> Memory-Prüffrage automatisch erledigt</p>
    <details><summary>Nachweis ansehen</summary><p>{payment.value}</p><p>Rechnung und Kontoauszug stimmen in Betrag, Rechnungsnummer, Mandatsreferenz und Gläubiger-ID überein. Systembestätigung durch Ledger.</p><dl><dt>Mail</dt><dd>{payment.fact.source_ref}</dd><dt>Rechnungsbeleg</dt><dd>{payment.invoice_sha256}</dd><dt>Kontoauszug</dt><dd>{payment.bank_sha256} · {payment.bank_locator}</dd><dt>Abgleich</dt><dd>{payment.result_id}</dd></dl></details>
   </article>
  {/each}
 </section>
{/if}

<style>
 .payments{border:1px solid #dce4ee;border-radius:16px;background:#fff;padding:20px;margin:20px 0;color:#172335}
 header,.main,.done{display:flex;align-items:center;gap:10px}header{color:#355c7a}h2{font-size:18px;margin:0}header span{margin-left:auto;font-size:13px}
 article{padding-top:18px;margin-top:16px;border-top:1px solid #e8edf3;scroll-margin-top:90px}.main{justify-content:space-between;align-items:flex-start}.main strong{font-size:16px}.main b{white-space:nowrap;font-size:20px}p{font-size:14px;line-height:1.5;margin:6px 0;color:#607188}.done{color:#355c7a;margin:10px 0}
 details{font-size:13px}summary{cursor:pointer;color:#425e7c}dl{display:grid;grid-template-columns:110px minmax(0,1fr);gap:7px;color:#617086}dt{font-weight:600}dd{margin:0;overflow-wrap:anywhere;font-family:monospace;font-size:11px}
 @media(max-width:560px){.payments{padding:16px}.main{flex-direction:column;gap:4px}dl{grid-template-columns:1fr}dd{margin-bottom:7px}}
</style>
