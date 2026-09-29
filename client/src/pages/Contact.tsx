import { useState } from 'react';
import { SiteNav } from '../components/SiteNav';
import { useStore, type FeedbackInput } from '../store';

const TOPICS: { value: NonNullable<FeedbackInput['topic']>; label: string }[] = [
  { value: 'bug', label: 'Something is broken' },
  { value: 'idea', label: 'An idea or feature request' },
  { value: 'balance', label: 'Balance / the Oracle got a character wrong' },
  { value: 'other', label: 'Something else' },
];

export default function Contact() {
  const sendFeedback = useStore((s) => s.sendFeedback);
  const pushToast = useStore((s) => s.pushToast);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [topic, setTopic] = useState<NonNullable<FeedbackInput['topic']>>('idea');
  const [message, setMessage] = useState('');
  const [company, setCompany] = useState(''); // honeypot
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    const text = message.trim();
    if (text.length < 4) {
      pushToast({ kind: 'warn', message: 'Please write a little more.' });
      return;
    }
    setSending(true);
    const result = await sendFeedback({
      name: name.trim(),
      email: email.trim(),
      topic,
      message: text,
      company,
    });
    setSending(false);
    if (!result.ok) {
      pushToast({ kind: 'error', message: result.error ?? 'Could not send that.' });
      return;
    }
    setSent(true);
    setMessage('');
    pushToast({ kind: 'success', message: 'Thanks — your message is on its way.' });
  };

  return (
    <div className="relative min-h-screen">
      <SiteNav />

      <div className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="hgd-heading text-center text-[26px] sm:text-[34px]">CONTACT</h1>
        <p className="mt-3 text-center text-[13px] leading-relaxed text-muted">
          Found a bug, spotted a bad power-scaling call, or have an idea for the next version? Write it below — it
          comes straight to the developer.
        </p>

        {sent ? (
          <div className="hgd-card mt-8 p-6 text-center">
            <p className="text-[24px]">📜</p>
            <h2 className="hgd-heading mt-2 text-lg">Message received</h2>
            <p className="mt-2 text-[13px] text-muted">
              Thank you. Your feedback was delivered. If you left an address, you may get a reply.
            </p>
            <button
              type="button"
              className="hgd-btn hgd-btn-secondary mt-4"
              onClick={() => {
                setSent(false);
                setTopic('idea');
                setName('');
                setEmail('');
              }}
            >
              Send another
            </button>
          </div>
        ) : (
          <div className="hgd-card mt-8 p-4 sm:p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-[11px] uppercase tracking-wide text-muted">Name (optional)</span>
                <input
                  className="hgd-input !text-[13px]"
                  value={name}
                  maxLength={60}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Rin"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] uppercase tracking-wide text-muted">
                  Email (optional, for a reply)
                </span>
                <input
                  className="hgd-input !text-[13px]"
                  value={email}
                  maxLength={160}
                  type="email"
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </label>
            </div>

            <label className="mt-3 block">
              <span className="mb-1 block text-[11px] uppercase tracking-wide text-muted">Topic</span>
              <select
                className="hgd-input !text-[13px]"
                value={topic}
                onChange={(e) => setTopic(e.target.value as NonNullable<FeedbackInput['topic']>)}
              >
                {TOPICS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="mt-3 block">
              <span className="mb-1 block text-[11px] uppercase tracking-wide text-muted">Message</span>
              <textarea
                className="hgd-input !min-h-[150px] !py-2 !text-[13px]"
                value={message}
                maxLength={2000}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Tell me what happened, or what you'd like to see…"
              />
            </label>
            <p className="mt-1 text-right text-[11px] text-muted">{message.length}/2000</p>

            {/* Honeypot: hidden from people, irresistible to bots. */}
            <label className="hidden" aria-hidden="true">
              Company
              <input tabIndex={-1} autoComplete="off" value={company} onChange={(e) => setCompany(e.target.value)} />
            </label>

            <button
              type="button"
              className="hgd-btn hgd-btn-primary mt-4 w-full"
              disabled={sending}
              onClick={submit}
            >
              {sending ? 'Sending…' : 'Send Feedback'}
            </button>
            <p className="mt-3 text-center text-[11px] leading-relaxed text-muted">
              Messages are delivered directly to the developer. Your address is never shown to anyone else.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
