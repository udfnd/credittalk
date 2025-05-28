// supabase/functions/create-chat-room/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts'; // _shared/cors.ts 파일 필요

interface CreateChatRoomPayload {
  otherUserId: string; // 채팅할 상대방의 auth.users.id
}

serve(async (req: Request) => {
  // OPTIONS 요청 처리 (CORS preflight)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 요청 본문에서 상대방 사용자 ID 가져오기
    const payload: CreateChatRoomPayload = await req.json();
    const { otherUserId } = payload;

    if (!otherUserId) {
      throw new Error('Missing otherUserId in request body.');
    }

    // Supabase Admin 클라이언트 생성 (서비스 키 사용)
    const supabaseAdminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } } // 사용자 컨텍스트 전달
    );

    // 요청을 보낸 사용자(현재 사용자) 정보 가져오기
    const { data: { user: currentUser }, error: userError } = await supabaseAdminClient.auth.getUser();
    if (userError || !currentUser) {
      console.error('Error fetching current user:', userError);
      throw new Error('Could not authenticate user.');
    }

    if (currentUser.id === otherUserId) {
      throw new Error('Cannot create a chat room with yourself.');
    }

    // 1. 기존 1:1 채팅방이 있는지 확인 (이전에 만든 RPC 함수 사용)
    const { data: existingRooms, error: rpcError } = await supabaseAdminClient.rpc(
      'find_existing_dm_room',
      { user1_id: currentUser.id, user2_id: otherUserId }
    );

    if (rpcError) {
      console.error('RPC find_existing_dm_room error:', rpcError);
      throw rpcError;
    }

    if (existingRooms && existingRooms.length > 0) {
      // 기존 채팅방 정보 반환
      return new Response(
        JSON.stringify({ roomId: existingRooms[0].room_id, isNew: false }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    // 2. 새 채팅방 생성 (서비스 키를 사용하므로 RLS 제약 없음)
    const { data: newRoom, error: newRoomError } = await supabaseAdminClient
      .from('chat_rooms')
      .insert({}) // 1:1 채팅은 이름이 없을 수 있음
      .select()
      .single();

    if (newRoomError) {
      console.error('Error creating chat_rooms:', newRoomError);
      throw newRoomError;
    }
    if (!newRoom) {
      throw new Error('Failed to create new chat room record.');
    }

    // 3. 두 사용자를 새 채팅방에 참여자로 추가 (서비스 키 사용)
    const participantsData = [
      { user_id: currentUser.id, room_id: newRoom.id },
      { user_id: otherUserId, room_id: newRoom.id },
    ];

    const { error: participantsError } = await supabaseAdminClient
      .from('chat_room_participants')
      .insert(participantsData);

    if (participantsError) {
      console.error('Error inserting chat_room_participants:', participantsError);
      // 생성된 채팅방 롤백 (선택적이지만 권장)
      await supabaseAdminClient.from('chat_rooms').delete().eq('id', newRoom.id);
      throw participantsError;
    }

    return new Response(
      JSON.stringify({ roomId: newRoom.id, isNew: true, message: 'Chat room created successfully.' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 201, // 201 Created
      }
    );
  } catch (error: any) {
    console.error('Function error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: error.message.includes('authenticate user') || error.message.includes('Forbidden') ? 401 : 400,
    });
  }
});
