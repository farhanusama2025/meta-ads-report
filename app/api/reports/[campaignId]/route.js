import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const cache = new Map();
const validRanges = new Set(['today', '7d', '14d', '30d', 'lifetime', 'custom']);

function datePreset(range, since, until) {
  if (range === 'custom') return { time_range: JSON.stringify({ since, until }) };
  if (range === 'today') return { date_preset: 'today' };
  if (range === '7d') return { date_preset: 'last_7d' };
  if (range === '14d') return { date_preset: 'last_14d' };
  if (range === '30d') return { date_preset: 'last_30d' };
  return { date_preset: 'maximum' };
}

function actionValue(actions, types) {
  return actions?.filter((item) => types.includes(item.action_type))
    .reduce((sum, item) => sum + Number(item.value || 0), 0) || 0;
}

function normalizeCampaign(campaign, insight = {}) {
  const actions = insight.actions || [];
  const values = insight.action_values || [];
  const purchases = actionValue(actions, ['purchase', 'omni_purchase']);
  const revenue = actionValue(values, ['purchase', 'omni_purchase']);
  const spend = Number(insight.spend || 0);
  const clicks = Number(insight.clicks || 0);
  const impressions = Number(insight.impressions || 0);
  const leads = actionValue(actions, ['lead', 'onsite_conversion.lead_grouped']);
  const outboundClicks = Number(insight.outbound_clicks?.[0]?.value || 0);
  const landingPageViews = actionValue(actions, ['landing_page_view']);
  const addToCart = actionValue(actions, ['add_to_cart', 'omni_add_to_cart']);
  const checkout = actionValue(actions, ['initiate_checkout', 'omni_initiated_checkout']);
  // Meta reports Messaging conversations with this action type for click-to-message campaigns.
  const messagingConversations = actionValue(actions, [
    'onsite_conversion.messaging_conversation_started_7d',
    'onsite_conversion.messaging_first_reply',
    'onsite_conversion.messaging_user_depth_2_message_send'
  ]);
  const videoPlays = actionValue(insight.video_play_actions, ['video_view']);
  const threeSecondVideoPlays = actionValue(actions, ['video_view']);
  const thruPlays = actionValue(insight.video_thruplay_watched_actions, ['video_view']);
  const avgWatchTime = actionValue(insight.video_avg_time_watched_actions, ['video_view']);
  const engagements = actionValue(actions, ['post_engagement']);
  const results = messagingConversations || purchases || leads;
  const resultLabel = messagingConversations ? 'Messaging conversations' : purchases ? 'Purchases' : leads ? 'Leads' : 'Results';
  return {
    id: campaign.id,
    name: campaign.name,
    status: campaign.status,
    objective: campaign.objective || '—',
    currency: insight.account_currency || 'USD',
    spend, revenue, purchases, leads, messagingConversations, clicks, impressions, outboundClicks, landingPageViews, addToCart, checkout,
    reach: Number(insight.reach || 0),
    ctr: Number(insight.ctr || 0),
    cpc: Number(insight.cpc || 0),
    cpm: Number(insight.cpm || 0),
    frequency: Number(insight.frequency || 0),
    outboundCtr: Number(insight.outbound_clicks_ctr?.[0]?.value || 0),
    costPerOutboundClick: Number(insight.cost_per_outbound_click?.[0]?.value || 0),
    costPerLandingPageView: landingPageViews ? spend / landingPageViews : 0,
    costPerAddToCart: addToCart ? spend / addToCart : 0,
    costPerCheckout: checkout ? spend / checkout : 0,
    results, resultLabel,
    costPerResult: results ? spend / results : 0,
    roas: spend > 0 ? revenue / spend : 0,
    cpa: purchases > 0 ? spend / purchases : 0,
    purchaseConversionRate: clicks ? (purchases / clicks) * 100 : 0,
    videoPlays, threeSecondVideoPlays, thruPlays, avgWatchTime,
    engagements, engagementRate: impressions ? (engagements / impressions) * 100 : 0,
    costPerEngagement: engagements ? spend / engagements : 0,
    qualityRanking: null,
    updatedAt: new Date().toISOString()
  };
}

async function graph(path, params) {
  const version = process.env.META_API_VERSION || 'v22.0';
  const search = new URLSearchParams({ ...params, access_token: process.env.META_ACCESS_TOKEN });
  const response = await fetch(`https://graph.facebook.com/${version}/${path}?${search}`, { cache: 'no-store' });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error?.message || 'Meta Graph API request failed');
  return body;
}

export async function GET(request, { params }) {
  const campaignId = params.campaignId;
  const searchParams = new URL(request.url).searchParams;
  const range = searchParams.get('range') || '14d';
  const since = searchParams.get('since');
  const until = searchParams.get('until');
  if (!/^\d{5,30}$/.test(campaignId) || !validRanges.has(range)) {
    return NextResponse.json({ error: 'Invalid campaign ID or date range.' }, { status: 400 });
  }
  if (range === 'custom' && (!/^\d{4}-\d{2}-\d{2}$/.test(since || '') || !/^\d{4}-\d{2}-\d{2}$/.test(until || '') || since > until)) {
    return NextResponse.json({ error: 'Choose a valid custom date range.' }, { status: 400 });
  }
  if (!process.env.META_ACCESS_TOKEN || !process.env.META_AD_ACCOUNT_ID) {
    return NextResponse.json({ error: 'Reporting service is not configured.' }, { status: 503 });
  }
  const ttl = Math.max(30, Number(process.env.REPORT_CACHE_TTL_SECONDS || 300)) * 1000;
  const cacheKey = `${campaignId}:${range}:${since || ''}:${until || ''}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < ttl) {
    return NextResponse.json({ ...cached.data, cache: 'HIT' }, { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' } });
  }

  try {
    const [campaign, insights] = await Promise.all([
      graph(campaignId, { fields: 'id,name,status,objective,account_id' }),
      graph(`${campaignId}/insights`, {
        ...datePreset(range, since, until), level: 'campaign',
        fields: 'account_currency,spend,reach,impressions,frequency,clicks,ctr,cpc,cpm,outbound_clicks,outbound_clicks_ctr,cost_per_outbound_click,actions,action_values,video_play_actions,video_thruplay_watched_actions,video_avg_time_watched_actions'
      })
    ]);
    const configuredAccount = process.env.META_AD_ACCOUNT_ID.replace(/^act_/, '');
    if (String(campaign.account_id) !== configuredAccount) {
      return NextResponse.json({ error: 'This report is unavailable.' }, { status: 404 });
    }
    const data = normalizeCampaign(campaign, insights.data?.[0]);
    cache.set(cacheKey, { createdAt: Date.now(), data });
    return NextResponse.json({ ...data, cache: 'MISS' }, { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' } });
  } catch (error) {
    console.error('Meta report fetch failed', error);
    return NextResponse.json({
      error: 'Unable to load this report right now.',
      ...(process.env.NODE_ENV === 'development' ? { details: error.message } : {})
    }, { status: 502 });
  }
}
