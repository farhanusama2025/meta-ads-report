'use client';

import { useEffect, useMemo, useState } from 'react';

const ranges = [['today', 'Today'], ['7d', '7 days'], ['14d', '14 days'], ['30d', '30 days'], ['lifetime', 'Lifetime'], ['custom', 'Custom']];
const numericId = /^\d{5,30}$/;

function format(value, currency, options = {}) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0, ...options }).format(value || 0);
}
function money(value, currency) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD', maximumFractionDigits: 2 }).format(value || 0);
}

export default function ReportClient() {
  const [campaignId, setCampaignId] = useState('');
  const [range, setRange] = useState('14d');
  const [report, setReport] = useState(null);
  const [state, setState] = useState('idle');
  const [message, setMessage] = useState('Enter the campaign ID that was shared with you.');
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminKey, setAdminKey] = useState('');
  const [health, setHealth] = useState(null);
  const [since, setSince] = useState('');
  const [until, setUntil] = useState('');

  useEffect(() => {
    const url = new URL(window.location.href);
    const id = url.searchParams.get('campaign');
    const selectedRange = url.searchParams.get('range');
    if (id && numericId.test(id)) { setCampaignId(id); if (ranges.some(([key]) => key === selectedRange)) setRange(selectedRange); setSince(url.searchParams.get('since') || ''); setUntil(url.searchParams.get('until') || ''); if (selectedRange !== 'custom') load(id, selectedRange || '14d'); }
  }, []);

  const dateLabel = useMemo(() => range === 'custom' && since && until ? `${since} to ${until}` : (ranges.find(([key]) => key === range)?.[1] || '14 days'), [range, since, until]);

  async function load(nextId = campaignId, nextRange = range) {
    if (!numericId.test(nextId)) { setState('error'); setMessage('Please enter a valid numeric Meta Campaign ID.'); return; }
    setState('loading'); setMessage('Fetching the latest campaign performance…');
    try {
      if (nextRange === 'custom' && (!since || !until || since > until)) throw new Error('Select a valid start and end date.');
      const params = new URLSearchParams({ range: nextRange });
      if (nextRange === 'custom') { params.set('since', since); params.set('until', until); }
      const response = await fetch(`/api/reports/${encodeURIComponent(nextId)}?${params}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Report could not be loaded.');
      setReport(data); setState('success'); setMessage(`Data refreshed just now · ${data.cache === 'HIT' ? 'cached result' : 'live result'}`);
      const url = new URL(window.location.href); url.searchParams.set('campaign', nextId); url.searchParams.set('range', nextRange); if (nextRange === 'custom') { url.searchParams.set('since', since); url.searchParams.set('until', until); } else { url.searchParams.delete('since'); url.searchParams.delete('until'); } window.history.replaceState({}, '', url);
    } catch (error) { setReport(null); setState('error'); setMessage(error.message); }
  }

  async function checkHealth(event) {
    event.preventDefault(); setHealth({ loading: true });
    const response = await fetch('/api/admin/health', { headers: { 'x-admin-key': adminKey } });
    const data = await response.json();
    setHealth(response.ok ? data : { error: data.error || 'Unable to validate admin access.' });
  }

  function chooseRange(nextRange) { setRange(nextRange); if (nextRange !== 'custom' && report) load(campaignId, nextRange); }
  async function copyLink() { await navigator.clipboard.writeText(window.location.href); setMessage('Report link copied to your clipboard.'); }
  function downloadPng() {
    if (!report) return;
    const canvas = document.createElement('canvas');
    canvas.width = 1600; canvas.height = 900;
    const ctx = canvas.getContext('2d');
    const values = [['Amount spent', money(report.spend, currency)], ['Purchase value', money(report.revenue, currency)], ['ROAS', `${report.roas.toFixed(2)}×`], ['Purchases', format(report.purchases)], ['Link clicks', format(report.clicks)], ['CTR', `${report.ctr.toFixed(2)}%`], ['Reach', format(report.reach)], ['CPM', money(report.cpm, currency)]];
    ctx.fillStyle = '#f6f8fc'; ctx.fillRect(0, 0, 1600, 900);
    ctx.fillStyle = '#0866ff'; ctx.fillRect(0, 0, 1600, 14);
    ctx.fillStyle = '#14213d'; ctx.font = '700 54px system-ui'; ctx.fillText('Meta Ads Report', 100, 115);
    ctx.font = '600 34px system-ui'; ctx.fillText(report.name, 100, 180);
    ctx.fillStyle = '#667085'; ctx.font = '24px system-ui'; ctx.fillText(`Campaign ID: ${report.id}  •  ${dateLabel}  •  ${report.status}`, 100, 225);
    values.forEach(([label, value], index) => { const x = 100 + (index % 4) * 380; const y = 300 + Math.floor(index / 4) * 220; ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, 340, 170); ctx.fillStyle = '#667085'; ctx.font = '700 18px system-ui'; ctx.fillText(label.toUpperCase(), x + 28, y + 48); ctx.fillStyle = '#14213d'; ctx.font = '700 40px system-ui'; ctx.fillText(value, x + 28, y + 108); });
    ctx.fillStyle = '#667085'; ctx.font = '20px system-ui'; ctx.fillText(`Generated ${new Date().toLocaleString()} · Meta Ads Report`, 100, 820);
    const link = document.createElement('a'); link.download = `meta-report-${report.id}.png`; link.href = canvas.toDataURL('image/png'); link.click();
  }
  const currency = report?.currency || 'USD';
  const cards = report ? [
    ['Result', format(report.results), report.resultLabel], ['Cost per result', money(report.costPerResult, currency), report.resultLabel],
    ['Messaging conversations', format(report.messagingConversations), 'New conversations started'],
    ['Amount spent', money(report.spend, currency), 'Total delivery cost'], ['Reach', format(report.reach), 'Unique people reached'],
    ['Impressions', format(report.impressions), 'Total ad views'], ['Frequency', report.frequency.toFixed(2), 'Average views per person'],
    ['CPM', money(report.cpm, currency), 'Cost per 1,000 impressions'], ['Link clicks', format(report.clicks), `${money(report.cpc, currency)} cost per link click`],
    ['Outbound clicks', format(report.outboundClicks), `${money(report.costPerOutboundClick, currency)} per outbound click`], ['CTR (link)', `${report.ctr.toFixed(2)}%`, 'Link click-through rate'],
    ['Outbound CTR', `${report.outboundCtr.toFixed(2)}%`, 'Outbound click-through rate'], ['CPC (link)', money(report.cpc, currency), 'Cost per link click'],
    ['Cost per outbound click', money(report.costPerOutboundClick, currency), 'Outbound click cost'], ['Landing page views', format(report.landingPageViews), `${money(report.costPerLandingPageView, currency)} per view`],
    ['Cost per landing page view', money(report.costPerLandingPageView, currency), 'Landing page view cost'], ['Add to cart', format(report.addToCart), `${money(report.costPerAddToCart, currency)} per add to cart`],
    ['Cost per add to cart', money(report.costPerAddToCart, currency), 'Add-to-cart cost'], ['Initiate checkout', format(report.checkout), `${money(report.costPerCheckout, currency)} per checkout`],
    ['Cost per checkout', money(report.costPerCheckout, currency), 'Checkout initiation cost'], ['Purchases', format(report.purchases), `${money(report.cpa, currency)} CPA`],
    ['Cost per purchase (CPA)', money(report.cpa, currency), 'Purchase acquisition cost'], ['Purchase conversion value', money(report.revenue, currency), 'Tracked conversion value'],
    ['ROAS', `${report.roas.toFixed(2)}×`, 'Revenue ÷ spend'], ['Purchase conversion rate', `${report.purchaseConversionRate.toFixed(2)}%`, 'Purchases ÷ link clicks'],
    ['Video plays', format(report.videoPlays), 'Reported video plays'], ['3-second video plays', format(report.threeSecondVideoPlays), '3-second views'],
    ['ThruPlay', format(report.thruPlays), 'Completed / 15-second plays'], ['Video average watch time', `${report.avgWatchTime.toFixed(2)} sec`, 'Average video watch time'],
    ['Engagements', format(report.engagements), 'Post engagements'], ['Engagement rate', `${report.engagementRate.toFixed(2)}%`, 'Engagements ÷ impressions'],
    ['Cost per engagement', money(report.costPerEngagement, currency), 'Post engagement cost'], ['Quality ranking', report.qualityRanking || '—', 'Available at ad level in Meta Ads Manager']
  ] : [];

  return <main>
    <header className="topbar"><a className="brand" href="/">M<span>Meta Ads Report</span></a><button className="link-button" onClick={() => setAdminOpen(true)}>Admin</button></header>
    <section className="hero">
      <p className="eyebrow">CLIENT PERFORMANCE PORTAL</p><h1>Clear campaign results, without a client login.</h1>
      <p className="subcopy">View any campaign in the connected Meta ad account using its campaign ID.</p>
      <form className="search" onSubmit={(event) => { event.preventDefault(); load(); }}>
        <label className="sr-only" htmlFor="campaign">Campaign ID</label><input id="campaign" value={campaignId} onChange={(event) => setCampaignId(event.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="Enter Meta Campaign ID" />
        <button type="submit" disabled={state === 'loading'}>{state === 'loading' ? 'Loading…' : 'View report'}</button>
      </form>
      <p className={`notice ${state}`}>{message}</p>
    </section>
    {report && <section className="report" id="report">
      <div className="report-head"><div><div className="status"><i /> {report.status}</div><h2>{report.name}</h2><p>Campaign ID: <code>{report.id}</code> · {report.objective} · {dateLabel}</p></div><div className="actions"><div className="range-tabs">{ranges.map(([key, label]) => <button key={key} className={key === range ? 'selected' : ''} onClick={() => chooseRange(key)}>{label}</button>)}</div>{range === 'custom' && <div className="custom-dates"><input aria-label="Start date" type="date" value={since} onChange={(event) => setSince(event.target.value)} /><span>to</span><input aria-label="End date" type="date" value={until} onChange={(event) => setUntil(event.target.value)} /><button className="secondary" onClick={() => load(campaignId, 'custom')}>Apply</button></div>}<button className="secondary" onClick={copyLink}>Copy link</button><button className="secondary" onClick={downloadPng}>Download PNG</button><button className="secondary" onClick={() => window.print()}>Print / PDF</button></div></div>
      <div className="cards">{cards.map(([label, value, hint]) => <article className="card" key={label}><p>{label}</p><strong>{value}</strong><span>{hint}</span></article>)}</div>
      <section className="funnel"><div><p className="eyebrow">CONVERSION SNAPSHOT</p><h3>From attention to purchase</h3></div><div className="funnel-items"><div><b>{format(report.impressions)}</b><span>Impressions</span></div><em>→</em><div><b>{format(report.clicks)}</b><span>Clicks</span></div><em>→</em><div><b>{format(report.purchases)}</b><span>Purchases</span></div></div></section>
      <footer>Generated {new Date(report.updatedAt).toLocaleString()} · Metrics are supplied by Meta and may be subject to attribution updates.</footer>
    </section>}
    {adminOpen && <div className="modal-backdrop" role="presentation"><section className="modal" role="dialog" aria-modal="true" aria-label="Admin diagnostics"><button className="close" onClick={() => setAdminOpen(false)} aria-label="Close">×</button><p className="eyebrow">ADMIN DIAGNOSTICS</p><h2>Service health</h2><p>This page never shows your Meta token. Use the deployment’s admin key to check configuration.</p><form onSubmit={checkHealth}><label htmlFor="adminKey">Admin key</label><input id="adminKey" type="password" value={adminKey} onChange={(event) => setAdminKey(event.target.value)} /><button type="submit">Check status</button></form>{health?.loading && <p>Checking…</p>}{health?.error && <p className="error">{health.error}</p>}{health?.metaTokenConfigured !== undefined && <dl><dt>Meta token</dt><dd>{health.metaTokenConfigured ? 'Configured' : 'Missing'}</dd><dt>Ad account</dt><dd>{health.adAccountConfigured ? 'Configured' : 'Missing'}</dd><dt>Cache duration</dt><dd>{health.cacheTtlSeconds} seconds</dd></dl>}<p className="small">Change the token, ad account, and cache duration in Vercel Environment Variables. They are intentionally not editable from the public app.</p></section></div>}
  </main>;
}
