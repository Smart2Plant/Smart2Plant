// Email sending is a prototype hook.
// To send real emails, create a free EmailJS account (https://www.emailjs.com),
// add `npm install @emailjs/browser` and fill in these three values.
export const EMAILJS = { serviceId: '', templateId: '', publicKey: '' }

export async function sendReportEmail(_to: string, _subject: string, _body: string): Promise<'sent' | 'not-configured'> {
  if (!EMAILJS.serviceId || !EMAILJS.templateId || !EMAILJS.publicKey) return 'not-configured'
  // Example once configured:
  // const emailjs = await import('@emailjs/browser')
  // await emailjs.send(EMAILJS.serviceId, EMAILJS.templateId, { to_email: _to, subject: _subject, message: _body }, { publicKey: EMAILJS.publicKey })
  return 'not-configured'
}
