# credittalk-admin 이벤트 관리 페이지 코드

아래 파일들을 credittalk-admin repo에 추가하세요.

---

## 1. `src/app/admin/events/page.tsx` - 이벤트 목록

```tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

interface Event {
  id: number;
  title: string;
  entry_start_at: string;
  entry_end_at: string;
  winner_announce_at: string;
  winner_count: number;
  status: string;
  is_published: boolean;
  created_at: string;
}

const statusLabels: Record<string, { label: string; color: string }> = {
  draft: { label: '초안', color: 'bg-gray-100 text-gray-800' },
  active: { label: '진행중', color: 'bg-green-100 text-green-800' },
  closed: { label: '마감', color: 'bg-yellow-100 text-yellow-800' },
  announced: { label: '발표완료', color: 'bg-purple-100 text-purple-800' },
};

export default function EventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setEvents(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('정말로 이 이벤트를 삭제하시겠습니까?')) return;

    try {
      const { error } = await supabase.from('events').delete().eq('id', id);
      if (error) throw error;
      fetchEvents();
    } catch (err: any) {
      alert('삭제 실패: ' + err.message);
    }
  };

  const handleTogglePublish = async (event: Event) => {
    try {
      const { error } = await supabase
        .from('events')
        .update({ is_published: !event.is_published })
        .eq('id', event.id);
      if (error) throw error;
      fetchEvents();
    } catch (err: any) {
      alert('상태 변경 실패: ' + err.message);
    }
  };

  const handleStatusChange = async (id: number, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('events')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      fetchEvents();
    } catch (err: any) {
      alert('상태 변경 실패: ' + err.message);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error) {
    return <div className="text-red-500 p-4">에러: {error}</div>;
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">이벤트 관리</h1>
        <Link
          href="/admin/events/create"
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition"
        >
          + 새 이벤트
        </Link>
      </div>

      {events.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          등록된 이벤트가 없습니다.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white border border-gray-200 rounded-lg">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">
                  제목
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">
                  응모 기간
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">
                  발표일
                </th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">
                  당첨인원
                </th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">
                  상태
                </th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">
                  공개
                </th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">
                  작업
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {events.map((event) => {
                const status = statusLabels[event.status] || statusLabels.draft;
                return (
                  <tr key={event.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/events/${event.id}`}
                        className="text-indigo-600 hover:underline font-medium"
                      >
                        {event.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {formatDate(event.entry_start_at)} ~{' '}
                      {formatDate(event.entry_end_at)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {formatDate(event.winner_announce_at)}
                    </td>
                    <td className="px-4 py-3 text-center text-sm">
                      {event.winner_count}명
                    </td>
                    <td className="px-4 py-3 text-center">
                      <select
                        value={event.status}
                        onChange={(e) =>
                          handleStatusChange(event.id, e.target.value)
                        }
                        className={`text-xs px-2 py-1 rounded-full border-0 ${status.color}`}
                      >
                        <option value="draft">초안</option>
                        <option value="active">진행중</option>
                        <option value="closed">마감</option>
                        <option value="announced">발표완료</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleTogglePublish(event)}
                        className={`px-3 py-1 rounded-full text-xs ${
                          event.is_published
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {event.is_published ? '공개' : '비공개'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex justify-center gap-2">
                        <Link
                          href={`/admin/events/${event.id}/entries`}
                          className="text-blue-600 hover:underline text-sm"
                        >
                          응모자
                        </Link>
                        <Link
                          href={`/admin/events/${event.id}`}
                          className="text-gray-600 hover:underline text-sm"
                        >
                          수정
                        </Link>
                        <button
                          onClick={() => handleDelete(event.id)}
                          className="text-red-600 hover:underline text-sm"
                        >
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

---

## 2. `src/app/admin/events/create/page.tsx` - 이벤트 생성

```tsx
import EventForm from '@/components/EventForm';

export default function CreateEventPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">새 이벤트 생성</h1>
      <EventForm />
    </div>
  );
}
```

---

## 3. `src/app/admin/events/[id]/page.tsx` - 이벤트 상세/수정

```tsx
import EventForm from '@/components/EventForm';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditEventPage({ params }: Props) {
  const { id } = await params;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">이벤트 수정</h1>
      <EventForm eventId={id} />
    </div>
  );
}
```

---

## 4. `src/app/admin/events/[id]/entries/page.tsx` - 응모자 목록 및 추첨

```tsx
'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

interface Entry {
  entry_id: number;
  entry_number: number;
  entry_created_at: string;
  is_winner: boolean;
  user_id: number;
  user_nickname: string;
  user_phone_number: string;
}

interface Event {
  id: number;
  title: string;
  winner_count: number;
  status: string;
}

interface Props {
  params: Promise<{ id: string }>;
}

export default function EventEntriesPage({ params }: Props) {
  const { id } = use(params);
  const [event, setEvent] = useState<Event | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawing, setDrawing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    fetchData();
  }, [id]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 이벤트 정보 조회
      const { data: eventData, error: eventError } = await supabase
        .from('events')
        .select('id, title, winner_count, status')
        .eq('id', id)
        .single();

      if (eventError) throw eventError;
      setEvent(eventData);

      // 응모자 목록 조회
      const { data: entriesData, error: entriesError } = await supabase.rpc(
        'get_event_entries_admin',
        { p_event_id: parseInt(id) }
      );

      if (entriesError) throw entriesError;
      setEntries(entriesData || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDraw = async () => {
    if (!event) return;

    const confirmMsg = `${event.winner_count}명의 당첨자를 추첨하시겠습니까?\n\n총 응모자: ${entries.length}명`;
    if (!confirm(confirmMsg)) return;

    setDrawing(true);
    try {
      const { data, error } = await supabase.rpc('draw_event_winners', {
        p_event_id: parseInt(id),
      });

      if (error) throw error;

      if (data && data[0]) {
        const result = data[0];
        if (result.success) {
          alert(
            `추첨 완료!\n\n당첨자 수: ${result.winner_count}명\n당첨 번호: ${result.winner_numbers?.join(', ')}`
          );
          fetchData();
        } else {
          alert('추첨 실패: ' + result.message);
        }
      }
    } catch (err: any) {
      alert('추첨 중 오류 발생: ' + err.message);
    } finally {
      setDrawing(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const maskPhoneNumber = (phone: string | null) => {
    if (!phone) return '-';
    if (phone.length >= 8) {
      return phone.slice(0, 3) + '****' + phone.slice(-4);
    }
    return phone;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error) {
    return <div className="text-red-500 p-4">에러: {error}</div>;
  }

  if (!event) {
    return <div className="text-gray-500 p-4">이벤트를 찾을 수 없습니다.</div>;
  }

  const winnerCount = entries.filter((e) => e.is_winner).length;

  return (
    <div className="p-6">
      <div className="mb-6">
        <Link
          href="/admin/events"
          className="text-indigo-600 hover:underline text-sm"
        >
          ← 이벤트 목록으로
        </Link>
      </div>

      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-bold">{event.title}</h1>
          <p className="text-gray-600 mt-1">응모자 관리</p>
        </div>
        <div className="text-right">
          <div className="text-sm text-gray-600 mb-2">
            총 응모자: <span className="font-bold">{entries.length}</span>명 /
            당첨 인원: <span className="font-bold">{event.winner_count}</span>명
          </div>
          {event.status !== 'announced' ? (
            <button
              onClick={handleDraw}
              disabled={drawing || entries.length === 0}
              className="bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {drawing ? '추첨 중...' : '🎲 당첨자 추첨'}
            </button>
          ) : (
            <div className="bg-purple-100 text-purple-800 px-4 py-2 rounded-lg">
              ✅ 추첨 완료 (당첨자 {winnerCount}명)
            </div>
          )}
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-lg">
          아직 응모자가 없습니다.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white border border-gray-200 rounded-lg">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">
                  응모번호
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">
                  닉네임
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">
                  연락처
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">
                  응모일
                </th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">
                  당첨여부
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {entries.map((entry) => (
                <tr
                  key={entry.entry_id}
                  className={`hover:bg-gray-50 ${
                    entry.is_winner ? 'bg-yellow-50' : ''
                  }`}
                >
                  <td className="px-4 py-3 text-center font-mono font-bold">
                    #{entry.entry_number}
                  </td>
                  <td className="px-4 py-3">{entry.user_nickname || '-'}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {maskPhoneNumber(entry.user_phone_number)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {formatDate(entry.entry_created_at)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {entry.is_winner ? (
                      <span className="bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-sm font-medium">
                        🏆 당첨
                      </span>
                    ) : event.status === 'announced' ? (
                      <span className="text-gray-400 text-sm">미당첨</span>
                    ) : (
                      <span className="text-gray-400 text-sm">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

---

## 5. `src/components/EventForm.tsx` - 이벤트 폼 컴포넌트

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { createClient } from '@/lib/supabase/client';

interface EventFormData {
  title: string;
  description: string;
  image_url: string;
  entry_start_at: string;
  entry_end_at: string;
  winner_announce_at: string;
  winner_count: number;
  status: string;
  is_published: boolean;
}

interface Props {
  eventId?: string;
}

export default function EventForm({ eventId }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [imageUrl, setImageUrl] = useState<string>('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const isEdit = !!eventId;

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<EventFormData>({
    defaultValues: {
      title: '',
      description: '',
      image_url: '',
      entry_start_at: '',
      entry_end_at: '',
      winner_announce_at: '',
      winner_count: 1,
      status: 'draft',
      is_published: false,
    },
  });

  useEffect(() => {
    if (eventId) {
      fetchEvent();
    }
  }, [eventId]);

  const fetchEvent = async () => {
    try {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('id', eventId)
        .single();

      if (error) throw error;
      if (data) {
        setValue('title', data.title);
        setValue('description', data.description);
        setValue('winner_count', data.winner_count);
        setValue('status', data.status);
        setValue('is_published', data.is_published);
        setValue(
          'entry_start_at',
          formatDateTimeLocal(data.entry_start_at)
        );
        setValue('entry_end_at', formatDateTimeLocal(data.entry_end_at));
        setValue(
          'winner_announce_at',
          formatDateTimeLocal(data.winner_announce_at)
        );
        if (data.image_url) {
          setImageUrl(data.image_url);
          setPreviewUrl(data.image_url);
        }
      }
    } catch (err: any) {
      alert('이벤트 로드 실패: ' + err.message);
    }
  };

  const formatDateTimeLocal = (isoString: string) => {
    const date = new Date(isoString);
    return date.toISOString().slice(0, 16);
  };

  const handleImageSelect = (file: File) => {
    setImageFile(file);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
  };

  const handleImageClear = () => {
    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }
    setImageFile(null);
    setPreviewUrl(imageUrl); // 기존 이미지로 복원
  };

  const uploadImage = async (): Promise<string | null> => {
    if (!imageFile) return imageUrl || null;

    try {
      const formData = new FormData();
      formData.append('file', imageFile);
      formData.append('folder', 'events');

      const response = await fetch('/api/admin/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('이미지 업로드 실패');
      }

      const result = await response.json();
      return result.url;
    } catch (err: any) {
      throw new Error('이미지 업로드 중 오류: ' + err.message);
    }
  };

  const onSubmit = async (data: EventFormData) => {
    setLoading(true);
    try {
      // 이미지 업로드
      const uploadedImageUrl = await uploadImage();

      const eventData = {
        title: data.title,
        description: data.description,
        image_url: uploadedImageUrl,
        entry_start_at: new Date(data.entry_start_at).toISOString(),
        entry_end_at: new Date(data.entry_end_at).toISOString(),
        winner_announce_at: new Date(data.winner_announce_at).toISOString(),
        winner_count: data.winner_count,
        status: data.status,
        is_published: data.is_published,
        updated_at: new Date().toISOString(),
      };

      if (isEdit) {
        const { error } = await supabase
          .from('events')
          .update(eventData)
          .eq('id', eventId);
        if (error) throw error;
        alert('이벤트가 수정되었습니다.');
      } else {
        const { error } = await supabase.from('events').insert(eventData);
        if (error) throw error;
        alert('이벤트가 생성되었습니다.');
      }

      router.push('/admin/events');
    } catch (err: any) {
      alert('저장 실패: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-2xl space-y-6">
      {/* 제목 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          제목 <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          {...register('title', { required: '제목을 입력해주세요.' })}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          placeholder="이벤트 제목"
        />
        {errors.title && (
          <p className="text-red-500 text-sm mt-1">{errors.title.message}</p>
        )}
      </div>

      {/* 설명 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          설명 <span className="text-red-500">*</span>
        </label>
        <textarea
          {...register('description', { required: '설명을 입력해주세요.' })}
          rows={6}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          placeholder="이벤트 상세 설명"
        />
        {errors.description && (
          <p className="text-red-500 text-sm mt-1">
            {errors.description.message}
          </p>
        )}
      </div>

      {/* 이미지 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          대표 이미지
        </label>
        <div className="space-y-2">
          {previewUrl && (
            <div className="relative inline-block">
              <img
                src={previewUrl}
                alt="Preview"
                className="max-w-xs rounded-lg border"
              />
              <button
                type="button"
                onClick={handleImageClear}
                className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center"
              >
                ×
              </button>
            </div>
          )}
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImageSelect(file);
            }}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
          />
        </div>
      </div>

      {/* 응모 기간 */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            응모 시작일 <span className="text-red-500">*</span>
          </label>
          <input
            type="datetime-local"
            {...register('entry_start_at', {
              required: '응모 시작일을 선택해주세요.',
            })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            응모 마감일 <span className="text-red-500">*</span>
          </label>
          <input
            type="datetime-local"
            {...register('entry_end_at', {
              required: '응모 마감일을 선택해주세요.',
            })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
      </div>

      {/* 당첨 발표일 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          당첨자 발표일 <span className="text-red-500">*</span>
        </label>
        <input
          type="datetime-local"
          {...register('winner_announce_at', {
            required: '발표일을 선택해주세요.',
          })}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        />
      </div>

      {/* 당첨 인원 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          당첨 인원 <span className="text-red-500">*</span>
        </label>
        <input
          type="number"
          min="1"
          {...register('winner_count', {
            required: '당첨 인원을 입력해주세요.',
            min: { value: 1, message: '최소 1명 이상이어야 합니다.' },
          })}
          className="w-32 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        />
        <span className="ml-2 text-gray-600">명</span>
      </div>

      {/* 상태 */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            상태
          </label>
          <select
            {...register('status')}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="draft">초안</option>
            <option value="active">진행중</option>
            <option value="closed">마감</option>
            <option value="announced">발표완료</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            공개 여부
          </label>
          <label className="flex items-center mt-2">
            <input
              type="checkbox"
              {...register('is_published')}
              className="w-5 h-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
            />
            <span className="ml-2 text-gray-700">앱에 공개</span>
          </label>
        </div>
      </div>

      {/* 버튼 */}
      <div className="flex gap-4 pt-4">
        <button
          type="submit"
          disabled={loading}
          className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 transition disabled:opacity-50"
        >
          {loading ? '저장 중...' : isEdit ? '수정하기' : '생성하기'}
        </button>
        <button
          type="button"
          onClick={() => router.push('/admin/events')}
          className="bg-gray-200 text-gray-700 px-6 py-2 rounded-lg hover:bg-gray-300 transition"
        >
          취소
        </button>
      </div>
    </form>
  );
}
```

---

## 6. admin layout.tsx 수정 안내

`src/app/admin/layout.tsx` 파일의 네비게이션 항목에 이벤트 메뉴를 추가하세요:

```tsx
// 기존 navItems 배열에 추가
{
  name: '이벤트',
  href: '/admin/events',
  icon: GiftIcon, // heroicons에서 import
},
```

상단 import에 추가:
```tsx
import { GiftIcon } from '@heroicons/react/24/outline';
```

---

## 폴더 구조

```
src/app/admin/events/
├── page.tsx                    # 이벤트 목록
├── create/
│   └── page.tsx               # 이벤트 생성
└── [id]/
    ├── page.tsx               # 이벤트 수정
    └── entries/
        └── page.tsx           # 응모자 목록 및 추첨

src/components/
└── EventForm.tsx              # 이벤트 폼 컴포넌트
```
