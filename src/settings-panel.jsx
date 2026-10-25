import React, { useEffect, useId, useState } from 'react';
import { EVENT_KINDS, normalizePreferences } from './preferences.js';

const messages = {
  en: {
    heading: 'macOS notifications', enabled: 'Enable notifications', mode: 'Notification content', custom: 'Custom', minimal: 'Simple generic notification',
    title: 'Notification title', chat: 'Chat title', event: 'Event name', duration: 'Show elapsed duration', preview: 'Include message preview (opt-in)', background: 'Only notify when this chat is out of view',
    privacy: 'Previews may expose conversation content on your lock screen. Leave previews off for privacy.',
    minimalHelp: 'Simple mode uses generic content without chat titles, previews, or duration. Your custom choices are preserved.',
    notice: 'Apple controls banners versus alerts per app in macOS System Settings. Keeping a notification is guaranteed only in the DSH attention list, not as a sticky macOS banner. The DSH renderer must stay open. Notifications and dismissals never approve tools.',
    permission: 'Notification permission', granted: 'Granted', default: 'Not requested', denied: 'Denied — change in macOS System Settings', unavailable: 'Unavailable',
    native: 'Native macOS renderer available', notNative: 'Native macOS notifications require the real DSH macOS renderer.', request: 'Request permission', test: 'Send test notification',
    events: 'Event delivery', eventEnabled: 'Enabled', policy: 'Delivery policy', os: 'OS-controlled notification', keep: 'Keep in DSH attention list / request attention where supported', auto: 'Auto-remove after N seconds', seconds: 'Auto-remove delay (seconds)',
    autoHelp: 'Auto-remove also removes the notification from Notification Center, not just the banner. Delay: 1–3600 seconds.',
    list: 'DSH attention list', empty: 'No notifications need acknowledgement.', dismiss: 'Acknowledge', unknownChat: 'Untitled chat',
    save: 'Save', reset: 'Reset saved defaults', draft: 'Unsaved changes', saved: 'Saved settings', savedFeedback: 'Settings saved.', resetFeedback: 'Saved defaults reset.',
    actionDone: 'Action completed.', actionFailed: 'Action failed. Please try again.', saving: 'Working…', saveFailed: 'Settings could not be saved.',
    kinds: { completed: 'Completed', error: 'Error', aborted: 'Aborted', blocked: 'Blocked', 'max-tokens': 'Token limit reached', approval: 'Tool approval', question: 'Question', 'plan-review': 'Plan review' },
  },
  tr: {
    heading: 'macOS bildirimleri', enabled: 'Bildirimleri etkinleştir', mode: 'Bildirim içeriği', custom: 'Özel', minimal: 'Basit genel bildirim',
    title: 'Bildirim başlığı', chat: 'Sohbet başlığı', event: 'Olay adı', duration: 'Geçen süreyi göster', preview: 'Mesaj önizlemesini ekle (isteğe bağlı)', background: 'Yalnızca ilgili sohbet görünümde değilken bildir',
    privacy: 'Önizlemeler kilit ekranında sohbet içeriğini açığa çıkarabilir. Gizlilik için önizlemeleri kapalı tutun.',
    minimalHelp: 'Basit mod; sohbet başlığı, önizleme veya süre içermeyen genel içerik kullanır. Özel tercihleriniz korunur.',
    notice: 'Uygulamanın şerit veya uyarı göstermesini Apple, macOS Sistem Ayarları üzerinden denetler. Bildirimin kalması yalnızca DSH dikkat listesinde garantidir; macOS şeridinin kalıcı olması garanti edilmez. DSH arayüzü açık kalmalıdır. Bildirimler ve onaylandı işaretlemeleri araçlara asla izin vermez.',
    permission: 'Bildirim izni', granted: 'İzin verildi', default: 'Henüz istenmedi', denied: 'Reddedildi — macOS Sistem Ayarlarından değiştirin', unavailable: 'Kullanılamıyor',
    native: 'Yerel macOS arayüzü kullanılabilir', notNative: 'Yerel macOS bildirimleri gerçek DSH macOS arayüzünü gerektirir.', request: 'İzin iste', test: 'Test bildirimi gönder',
    events: 'Olay bildirimleri', eventEnabled: 'Etkin', policy: 'Bildirim davranışı', os: 'İşletim sistemi denetimli bildirim', keep: 'DSH dikkat listesinde tut / destekleniyorsa dikkat iste', auto: 'N saniye sonra otomatik kaldır', seconds: 'Otomatik kaldırma süresi (saniye)',
    autoHelp: 'Otomatik kaldırma yalnızca şeridi değil, Bildirim Merkezi kaydını da kaldırır. Süre: 1–3600 saniye.',
    list: 'DSH dikkat listesi', empty: 'İşaretlenmesi gereken bildirim yok.', dismiss: 'Görüldü olarak işaretle', unknownChat: 'Başlıksız sohbet',
    save: 'Kaydet', reset: 'Kayıtlı varsayılanlara sıfırla', draft: 'Kaydedilmemiş değişiklikler', saved: 'Kayıtlı ayarlar', savedFeedback: 'Ayarlar kaydedildi.', resetFeedback: 'Kayıtlı varsayılanlar sıfırlandı.',
    actionDone: 'İşlem tamamlandı.', actionFailed: 'İşlem başarısız. Lütfen tekrar deneyin.', saving: 'İşleniyor…', saveFailed: 'Ayarlar kaydedilemedi.',
    kinds: { completed: 'Tamamlandı', error: 'Hata', aborted: 'Durduruldu', blocked: 'Engellendi', 'max-tokens': 'Token sınırına ulaşıldı', approval: 'Araç izni', question: 'Soru', 'plan-review': 'Plan incelemesi' },
  },
};

export function SettingsPanel({ preferences, onSave, onRequestPermission, onTest, permission, nativeAvailable, records, onDismiss, onReset, saveError, locale = 'en' }) {
  const language = String(locale).toLowerCase().startsWith('tr') ? 'tr' : 'en';
  const t = messages[language];
  const id = useId();
  const incoming = JSON.stringify(normalizePreferences(preferences));
  const [draft, setDraft] = useState(() => normalizePreferences(preferences));
  const [saved, setSaved] = useState(incoming);
  const [feedback, setFeedback] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setDraft(JSON.parse(incoming));
    setSaved(incoming);
  }, [incoming]);
  const dirty = JSON.stringify(draft) !== saved;
  const update = (key, value) => setDraft(previous => ({ ...previous, [key]: value }));
  const updateEvent = (kind, key, value) => setDraft(previous => ({ ...previous, events: { ...previous.events, [kind]: { ...previous.events[kind], [key]: value } } }));
  const run = async (callback, success, after) => {
    if (busy || typeof callback !== 'function') return;
    setBusy(true);
    setFeedback('');
    setActionError('');
    try {
      const result = await callback();
      if (result === false || result?.ok === false) throw new Error('Action failed');
      after?.();
      // Callback messages are data, never HTML.
      setFeedback(typeof result?.message === 'string' ? result.message : success);
    } catch {
      setActionError(t.actionFailed);
    } finally {
      setBusy(false);
    }
  };
  const checkbox = (key, label, disabled = false, description) => <label className="dmn-check" key={key}>
    <input type="checkbox" checked={draft[key]} onChange={e => update(key, e.target.checked)} disabled={disabled || busy} aria-describedby={description} />
    <span>{label}</span>
  </label>;
  const permissionKey = ['granted', 'default', 'denied'].includes(permission) ? permission : 'unavailable';
  return <section className="dmn-panel" lang={language} aria-labelledby={`${id}-heading`}>
    <h2 id={`${id}-heading`}>{t.heading}</h2>
    <p className="dmn-notice">{t.notice}</p>
    <div className="dmn-status-block">
      <p><strong>{t.permission}:</strong> {t[permissionKey]}</p>
      <p>{nativeAvailable ? t.native : t.notNative}</p>
      <div className="dmn-actions">
        <button type="button" disabled={busy || !nativeAvailable || permissionKey !== 'default' || !onRequestPermission} onClick={() => run(onRequestPermission, t.actionDone)}>{t.request}</button>
        <button type="button" disabled={busy || !nativeAvailable || permissionKey !== 'granted' || !onTest} onClick={() => run(onTest, t.actionDone)}>{t.test}</button>
      </div>
    </div>
    <form onSubmit={e => { e.preventDefault(); const next = normalizePreferences(draft); run(() => onSave(next), t.savedFeedback, () => { setDraft(next); setSaved(JSON.stringify(next)); }); }}>
      {checkbox('enabled', t.enabled)}
      <label className="dmn-field"><span>{t.mode}</span><select value={draft.contentMode} disabled={busy || !draft.enabled} onChange={e => update('contentMode', e.target.value)}>
        <option value="custom">{t.custom}</option><option value="minimal">{t.minimal}</option>
      </select></label>
      <p id={`${id}-minimal`} className="dmn-help">{t.minimalHelp}</p>
      <fieldset className="dmn-custom" disabled={busy || !draft.enabled || draft.contentMode === 'minimal'} aria-describedby={`${id}-minimal`}>
        <legend>{t.custom}</legend>
        <label className="dmn-field"><span>{t.title}</span><select value={draft.titleMode} onChange={e => update('titleMode', e.target.value)}><option value="chat">{t.chat}</option><option value="event">{t.event}</option></select></label>
        {checkbox('showDuration', t.duration)}
        {checkbox('showPreview', t.preview, false, `${id}-privacy`)}
        <p id={`${id}-privacy`} className="dmn-help">{t.privacy}</p>
      </fieldset>
      {checkbox('backgroundOnly', t.background, !draft.enabled)}
      <fieldset className="dmn-events" disabled={busy || !draft.enabled}>
        <legend>{t.events}</legend>
        <p id={`${id}-auto`} className="dmn-help">{t.autoHelp}</p>
        {EVENT_KINDS.map(kind => <fieldset key={kind} className="dmn-event">
          <legend>{t.kinds[kind]}</legend>
          <label className="dmn-check"><input type="checkbox" checked={draft.events[kind].enabled} onChange={e => updateEvent(kind, 'enabled', e.target.checked)} /><span>{t.eventEnabled}</span></label>
          <label className="dmn-field"><span>{t.policy}</span><select disabled={!draft.events[kind].enabled} value={draft.events[kind].behavior} onChange={e => updateEvent(kind, 'behavior', e.target.value)}>
            <option value="os-default">{t.os}</option><option value="keep">{t.keep}</option><option value="auto-remove">{t.auto}</option>
          </select></label>
          {draft.events[kind].behavior === 'auto-remove' && <label className="dmn-field"><span>{t.seconds}</span><input type="number" min="1" max="3600" step="1" required disabled={!draft.events[kind].enabled} value={draft.events[kind].removeAfterSeconds} aria-describedby={`${id}-auto`} onChange={e => updateEvent(kind, 'removeAfterSeconds', e.target.value === '' ? '' : Number(e.target.value))} /></label>}
        </fieldset>)}
      </fieldset>
      <div className="dmn-actions">
        <button className="dmn-primary" type="submit" disabled={busy || !onSave}>{t.save}</button>
        <button type="button" disabled={busy || !onReset} onClick={() => run(onReset, t.resetFeedback, () => { const defaults = normalizePreferences(); setDraft(defaults); setSaved(JSON.stringify(defaults)); })}>{t.reset}</button>
        <span className="dmn-help">{busy ? t.saving : dirty ? t.draft : t.saved}</span>
      </div>
    </form>
    <div role="status" aria-live="polite" className="dmn-feedback">{!saveError && feedback}</div>
    {(saveError || actionError) && <p role="alert" className="dmn-error">{saveError ? `${t.saveFailed} ${saveError}` : actionError}</p>}
    <section className="dmn-attention" aria-labelledby={`${id}-attention`}>
      <h3 id={`${id}-attention`}>{t.list}</h3>
      {!records?.length ? <p className="dmn-help">{t.empty}</p> : <ul className="dmn-records">{records.map(record => {
        const date = new Date(record.createdAt);
        return <li key={record.id} className="dmn-record">
          <div><strong>{record.chatTitle || t.unknownChat}</strong><span>{t.kinds[record.kind] || record.kind}</span>{!Number.isNaN(date.getTime()) && <time dateTime={date.toISOString()}>{date.toLocaleString(language)}</time>}</div>
          <button type="button" disabled={busy || !onDismiss} aria-label={`${t.dismiss}: ${record.chatTitle || t.unknownChat} — ${t.kinds[record.kind] || record.kind}`} onClick={() => run(() => onDismiss(record.id), t.actionDone)}>{t.dismiss}</button>
        </li>;
      })}</ul>}
    </section>
  </section>;
}
