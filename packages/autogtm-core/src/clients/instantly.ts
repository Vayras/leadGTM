/**
 * Resend email client.
 *
 * This file intentionally preserves the old Instantly-facing function names so
 * existing campaign code can migrate without a broad app rewrite.
 */

import { Resend } from 'resend';
import type { InstantlyCampaign, InstantlyLead, InstantlySequenceStep } from '../types';

let resendClient: Resend | null = null;

interface LocalCampaignState extends InstantlyCampaign {
  from: string;
  sequences: InstantlySequenceStep[];
  status: number;
  sent: number;
  opened: number;
  replied: number;
  bounced: number;
}

const campaigns = new Map<string, LocalCampaignState>();

function getResendClient(): Resend {
  if (!resendClient) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error('RESEND_API_KEY is required');
    }
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

function getDefaultSender(): string {
  const sender = process.env.RESEND_FROM_EMAIL || process.env.RESEND_SENDER_EMAIL;
  if (!sender) {
    throw new Error('RESEND_FROM_EMAIL is required');
  }
  return sender;
}

function textFromHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function applyLeadVariables(template: string, lead: InstantlyLead): string {
  const variables: Record<string, string> = {
    first_name: lead.first_name || '',
    last_name: lead.last_name || '',
    company_name: lead.company_name || '',
    email: lead.email,
    ...(lead.variables || {}),
  };

  return Object.entries(variables).reduce(
    (body, [key, value]) => body.replace(new RegExp(`{{\\s*${key}\\s*}}`, 'g'), value),
    template
  );
}

export interface CreateCampaignParams {
  name: string;
  emailList: string[];
  sequences: InstantlySequenceStep[];
}

export async function createCampaign(params: CreateCampaignParams): Promise<InstantlyCampaign> {
  const id = `resend_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const from = params.emailList.find(Boolean) || getDefaultSender();

  const campaign: LocalCampaignState = {
    id,
    name: params.name,
    status: 0,
    timestamp_created: new Date().toISOString(),
    from,
    sequences: params.sequences,
    sent: 0,
    opened: 0,
    replied: 0,
    bounced: 0,
  };

  campaigns.set(id, campaign);
  return campaign;
}

export async function addLeadsToCampaign(campaignId: string, leads: InstantlyLead[]): Promise<void> {
  const campaign = campaigns.get(campaignId);
  if (!campaign) {
    throw new Error(`Resend campaign ${campaignId} not found in this process`);
  }

  const firstStep = campaign.sequences[0];
  if (!firstStep) {
    throw new Error(`Resend campaign ${campaignId} has no email sequence`);
  }

  const resend = getResendClient();
  for (const lead of leads) {
    const subject = applyLeadVariables(firstStep.subject, lead);
    const html = applyLeadVariables(firstStep.body, lead);
    const text = textFromHtml(html);

    const result = await resend.emails.send({
      from: campaign.from,
      to: lead.email,
      subject,
      html,
      text,
    });

    if (result.error) {
      throw new Error(`Resend API error: ${result.error.message}`);
    }

    campaign.sent += 1;
  }
}

export async function activateCampaign(campaignId: string): Promise<void> {
  const campaign = campaigns.get(campaignId);
  if (campaign) campaign.status = 1;
}

export async function pauseCampaign(campaignId: string): Promise<void> {
  const campaign = campaigns.get(campaignId);
  if (campaign) campaign.status = 2;
}

export async function getCampaign(campaignId: string): Promise<InstantlyCampaign> {
  const campaign = campaigns.get(campaignId);
  if (!campaign) {
    throw new Error(`Resend campaign ${campaignId} not found in this process`);
  }
  return campaign;
}

export async function listCampaigns(): Promise<{ items: InstantlyCampaign[] }> {
  return { items: Array.from(campaigns.values()) };
}

export async function getCampaignAnalytics(campaignId: string): Promise<{
  sent: number;
  opened: number;
  replied: number;
  bounced: number;
}> {
  const campaign = campaigns.get(campaignId);
  return {
    sent: campaign?.sent || 0,
    opened: campaign?.opened || 0,
    replied: campaign?.replied || 0,
    bounced: campaign?.bounced || 0,
  };
}

export async function deleteCampaign(campaignId: string): Promise<void> {
  campaigns.delete(campaignId);
}

export async function listAccounts(): Promise<{
  items: Array<{ email: string; status: number; warmup_status: number; daily_limit: number | null }>;
}> {
  return {
    items: [
      {
        email: getDefaultSender(),
        status: 1,
        warmup_status: 0,
        daily_limit: process.env.RESEND_DAILY_LIMIT ? Number(process.env.RESEND_DAILY_LIMIT) : null,
      },
    ],
  };
}

export async function launchCampaign(params: {
  name: string;
  emailList: string[];
  sequences: InstantlySequenceStep[];
  leads: InstantlyLead[];
}): Promise<InstantlyCampaign> {
  const campaign = await createCampaign({
    name: params.name,
    emailList: params.emailList,
    sequences: params.sequences,
  });

  await activateCampaign(campaign.id);
  if (params.leads.length > 0) {
    await addLeadsToCampaign(campaign.id, params.leads);
  }

  return campaign;
}
