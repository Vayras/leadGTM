import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@autogtm/core/db/supabaseCompat';
import { generateExplorationQuery, generateFocusedQuery, SEARCH_PLATFORMS } from '@autogtm/core/ai/generateDailyQuery';

export async function POST(request: NextRequest) {
  try {
    const { companyId, instructionId, platform: rawPlatform } = await request.json();
    const platform = typeof rawPlatform === 'string' && rawPlatform in SEARCH_PLATFORMS ? rawPlatform : undefined;

    if (!companyId) {
      return NextResponse.json({ error: 'companyId is required' }, { status: 400 });
    }

    const db = createClient();

    const { data: company, error: companyError } = await db
      .from('companies')
      .select('id, name, website, description, target_audience, agent_notes, system_enabled')
      .eq('id', companyId)
      .single();

    if (companyError || !company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    if (company.system_enabled === false) {
      return NextResponse.json({ error: 'System is off for this company' }, { status: 409 });
    }

    const { data: instructions, error: instructionsError } = instructionId
      ? await db
          .from('company_updates')
          .select('id, content, created_at')
          .eq('id', instructionId)
          .eq('company_id', companyId)
          .limit(1)
      : await db
          .from('company_updates')
          .select('id, content, created_at')
          .eq('company_id', companyId)
          .eq('query_generated', false)
          .order('created_at', { ascending: true })
          .limit(1);

    if (instructionsError) throw instructionsError;

    const instruction = (instructions || [])[0] as { id: string; content: string } | undefined;
    const generated = instruction
      ? await generateFocusedQuery({
          company: {
            name: company.name,
            website: company.website,
            description: company.description,
            targetAudience: company.target_audience,
          },
          instruction: instruction.content,
          platform,
        })
      : await generateExplorationQuery({
          company: {
            name: company.name,
            website: company.website,
            description: company.description,
            targetAudience: company.target_audience,
            agentNotes: company.agent_notes,
          },
          pastQueries: [],
          platform,
        });

    const { data: savedRows, error: saveError } = await db
      .from('exa_queries')
      .insert({
        company_id: companyId,
        query: generated.query,
        criteria: generated.criteria,
        is_active: true,
        status: 'pending',
        source_instruction_id: instruction?.id || null,
        generation_rationale: generated.rationale,
      })
      .select('*');

    if (saveError) throw saveError;

    if (instruction) {
      await db
        .from('company_updates')
        .update({ query_generated: true })
        .eq('id', instruction.id);
    }

    return NextResponse.json({
      success: true,
      message: 'Search generated',
      query: Array.isArray(savedRows) ? savedRows[0] : savedRows,
    });
  } catch (error) {
    console.error('Error generating query:', error);
    return NextResponse.json({ error: 'Failed to generate query' }, { status: 500 });
  }
}
