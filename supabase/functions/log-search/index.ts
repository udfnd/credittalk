import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

serve(async req => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 인증된 사용자 컨텍스트로 실행
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      },
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: '인증 필요' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    const body = await req.json().catch(() => ({}));
    const rawTerm =
      typeof body?.searchTerm === 'string' ? body.searchTerm.trim() : '';
    if (!rawTerm) {
      return new Response(JSON.stringify({ error: 'searchTerm is required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    // 1) 정확일치 검색 실행 (search_reports는 이미 정확일치 로직으로 재정의됨)
    const { data: rows, error: rpcError } = await supabase.rpc(
      'search_reports',
      {
        search_term: rawTerm,
      },
    );
    if (rpcError) throw rpcError;

    // RETURNS TABLE 이므로 0~1행 배열
    const row = Array.isArray(rows) ? rows[0] : rows;
    const totalCount = row?.total_count ?? 0;
    const exactMatch = totalCount > 0;

    // 2) 로그 저장 (정확일치 여부 함께 기록)
    const { error: insertError } = await supabase.from('search_logs').insert({
      user_id: user.id,
      search_term: rawTerm,
      exact_match: exactMatch,
    });

    if (insertError) throw insertError;

    return new Response(JSON.stringify({ ok: true, exactMatch, totalCount }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 201,
    });
  } catch (error: any) {
    console.error('log-search error:', error?.message || error);
    return new Response(
      JSON.stringify({ error: error?.message || String(error) }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    );
  }
});
