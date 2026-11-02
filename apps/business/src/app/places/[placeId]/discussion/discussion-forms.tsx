'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { TEXT } from '@/text';
import { post as send } from '../../../client';
import { ui } from '../../../ui';

/**
 * Sends text; if screening asks "post anyway?" (a WARN rule), shows the reason and lets
 * the person confirm, like the app does.
 */
function useWrite(path: string, after: () => void) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [warning, setWarning] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(body: Record<string, unknown>, confirm = false) {
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrf(),
        },
        body: JSON.stringify({ ...body, ...(confirm ? { confirmWarning: true } : {}) }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 409 && json.error?.code === 'CONTENT_WARNING') {
        setWarning(json.error.message);
        return;
      }
      if (!res.ok) throw new Error(json.error?.message ?? TEXT.common.failed);
      setWarning(undefined);
      if (json.held) setNotice(TEXT.discussion.heldNotice);
      after();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : TEXT.common.failed);
    } finally {
      setBusy(false);
    }
  }
  return { submit, busy, error, warning, notice };
}

function csrf(): string {
  const match = document.cookie.split('; ').find((c) => c.startsWith('jax_biz_csrf='));
  return match ? decodeURIComponent(match.slice('jax_biz_csrf='.length)) : '';
}

function Messages(props: {
  error?: string;
  warning?: string;
  notice?: string;
  busy: boolean;
  onConfirm: () => void;
}) {
  return (
    <>
      {props.error ? (
        <p role="alert" style={ui.error}>
          {props.error}
        </p>
      ) : null}
      {props.warning ? (
        <div role="alert">
          <p style={ui.error}>{props.warning}</p>
          <button
            type="button"
            style={ui.secondary}
            disabled={props.busy}
            onClick={props.onConfirm}
          >
            {TEXT.discussion.postAnyway}
          </button>
        </div>
      ) : null}
      {props.notice ? <p role="status">{props.notice}</p> : null}
    </>
  );
}

export function NewPostForm({ placeId }: { placeId: string }) {
  const [body, setBody] = useState('');
  const w = useWrite(`/api/places/${placeId}/posts`, () => setBody(''));
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void w.submit({ body });
  };
  return (
    <form onSubmit={onSubmit} style={{ marginBottom: 24 }}>
      <label style={ui.label}>
        {TEXT.discussion.newPost}
        <textarea
          style={{ ...ui.input, minHeight: 90 }}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={2000}
          required
        />
      </label>
      <Messages {...w} onConfirm={() => void w.submit({ body }, true)} />
      <button type="submit" disabled={w.busy} style={{ ...ui.primary, width: 'auto' }}>
        {TEXT.discussion.post}
      </button>
    </form>
  );
}

export function ReplyForm({
  placeId,
  postId,
  parentCommentId,
  compact = false,
}: {
  placeId: string;
  postId: string;
  parentCommentId?: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(!compact);
  const [body, setBody] = useState('');
  const w = useWrite(`/api/places/${placeId}/posts/${postId}/replies`, () => {
    setBody('');
    if (compact) setOpen(false);
  });
  const payload = () => ({ body, ...(parentCommentId ? { parentCommentId } : {}) });
  if (!open) {
    return (
      <button type="button" style={{ ...ui.secondary, marginTop: 8 }} onClick={() => setOpen(true)}>
        {TEXT.discussion.reply}
      </button>
    );
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void w.submit(payload());
      }}
      style={{ marginTop: 12 }}
    >
      <textarea
        style={{ ...ui.input, minHeight: 60 }}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={1000}
        aria-label={TEXT.discussion.reply}
        placeholder={TEXT.discussion.replyAs}
        required
      />
      <Messages {...w} onConfirm={() => void w.submit(payload(), true)} />
      <button type="submit" disabled={w.busy} style={{ ...ui.primary, width: 'auto' }}>
        {TEXT.discussion.reply}
      </button>
    </form>
  );
}

export function RemoveButton({ path, back }: { path: string; back?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <>
      <button
        type="button"
        style={{ ...ui.secondary, marginTop: 8 }}
        disabled={busy}
        onClick={async () => {
          if (!window.confirm(TEXT.discussion.removeConfirm)) return;
          setBusy(true);
          try {
            await send(path, {});
            if (back) router.replace(back);
            router.refresh();
          } catch (err) {
            setError(err instanceof Error ? err.message : TEXT.common.failed);
          } finally {
            setBusy(false);
          }
        }}
      >
        {TEXT.discussion.remove}
      </button>
      {error ? (
        <p role="alert" style={ui.error}>
          {error}
        </p>
      ) : null}
    </>
  );
}
