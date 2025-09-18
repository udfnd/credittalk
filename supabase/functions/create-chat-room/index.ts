// supabase/functions/create-chat-room/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import {
  createClient,
  SupabaseClient,
} from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts'; //

interface CreateChatRoomPayload {
  otherUserId: string;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload: CreateChatRoomPayload = await req.json();
    const { otherUserId } = payload;

    if (!otherUserId) {
      throw new Error('Missing otherUserId in request body.');
    }

    // Supabase Admin 클라이언트 생성 (서비스 키 사용, 사용자 컨텍스트 전달 제거)
    const supabaseAdminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      // { global: { headers: { Authorization: req.headers.get('Authorization')! } } } // 이 부분을 제거하거나 주석 처리!
    );

    // 요청을 보낸 사용자(현재 사용자) 정보 가져오기 - 클라이언트에서 토큰을 사용한 인증이 필요
    // 함수를 호출하는 클라이언트에서 Authorization 헤더에 유효한 JWT를 포함해야 합니다.
    // 서비스 키로 초기화된 클라이언트와 별개로 사용자 인증을 위해 클라이언트를 하나 더 만들거나,
    // 요청 헤더에서 직접 JWT를 파싱하여 사용자를 검증할 수 있습니다.
    // 여기서는 클라이언트에서 보낸 JWT를 사용하여 사용자 정보를 가져옵니다.
    const userSupabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '', // 일반적으로 anon key 사용
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      },
    );

    const {
      data: { user: currentUser },
      error: userError,
    } = await userSupabaseClient.auth.getUser();

    if (userError || !currentUser) {
      console.error('Error fetching current user:', userError);
      throw new Error(
        'Could not authenticate user. Make sure a valid JWT is provided in Authorization header.',
      );
    }

    if (currentUser.id === otherUserId) {
      throw new Error('Cannot create a chat room with yourself.');
    }

    // (기존 RPC 함수 호출, 채팅방 생성, 참여자 추가 로직은 동일 - supabaseAdminClient 사용)
    // 1. 기존 1:1 채팅방이 있는지 확인 (supabaseAdminClient 사용)
    const { data: existingRooms, error: rpcError } =
      await supabaseAdminClient.rpc('find_existing_dm_room', {
        user1_id: currentUser.id,
        user2_id: otherUserId,
      });

    if (rpcError) {
      console.error('RPC find_existing_dm_room error:', rpcError);
      throw rpcError;
    }

    if (existingRooms && existingRooms.length > 0) {
      return new Response(
        JSON.stringify({ roomId: existingRooms[0].room_id, isNew: false }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        },
      );
    }

    // 2. 새 채팅방 생성 (supabaseAdminClient 사용 - 서비스 키 권한)
    const { data: newRoom, error: newRoomError } = await supabaseAdminClient
      .from('chat_rooms')
      .insert({})
      .select()
      .single();

    if (newRoomError) {
      console.error('Error creating chat_rooms:', newRoomError);
      throw newRoomError;
    }
    if (!newRoom) {
      throw new Error('Failed to create new chat room record.');
    }

    // 3. 두 사용자를 새 채팅방에 참여자로 추가 (supabaseAdminClient 사용 - 서비스 키 권한)
    const participantsData = [
      { user_id: currentUser.id, room_id: newRoom.id },
      { user_id: otherUserId, room_id: newRoom.id },
    ];

    const { error: participantsError } = await supabaseAdminClient
      .from('chat_room_participants')
      .insert(participantsData);

    if (participantsError) {
      console.error(
        'Error inserting chat_room_participants:',
        participantsError,
      );
      await supabaseAdminClient
        .from('chat_rooms')
        .delete()
        .eq('id', newRoom.id);
      throw participantsError;
    }

    return new Response(
      JSON.stringify({
        roomId: newRoom.id,
        isNew: true,
        message: 'Chat room created successfully.',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 201,
      },
    );
  } catch (error: any) {
    console.error('Function error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status:
        error.message.includes('authenticate user') ||
        error.message.includes('Forbidden')
          ? 401
          : error.message.includes('Missing') ||
              error.message.includes('Cannot create a chat room with yourself')
            ? 400
            : 500,
    });
  }
});
