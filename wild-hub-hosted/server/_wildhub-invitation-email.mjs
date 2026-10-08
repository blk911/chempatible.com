// One renderer owns both the host's preview and the recipient's email.
// Editable content is plain text; the acceptance URL and email structure are not.
import {createHash} from 'node:crypto';
export const INVITATION_EMAIL_LIMITS=Object.freeze({subject:160,message:1500});
const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const label=value=>String(value).replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/gu,' ').trim();
function invalid(message){throw Object.assign(Error(message),{status:400,code:'invalid_invitation_email'});}
export function invitationEmailDraft({hostName,hubName,subject,message}={}) {
  const host=label(hostName),hub=label(hubName);
  if(subject===undefined)subject=`${host} invited you to their B-side`.slice(0,INVITATION_EMAIL_LIMITS.subject);
  if(message===undefined)message=`Come join ${hub} on BsideVibes. A place for photos, updates, and staying in the loop.\n\nTake a look around. Your invitation is below.`;
  if(typeof subject!=='string'||/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/u.test(subject)||!subject.trim()||subject.trim().length>INVITATION_EMAIL_LIMITS.subject)invalid('Write a subject of 1–160 characters without line breaks.');
  if(typeof message!=='string')invalid('Write a message of 1–1500 characters.');
  message=message.replace(/\r\n/g,'\n');
  if(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(message)||!message.trim()||message.trim().length>INVITATION_EMAIL_LIMITS.message)invalid('Write a message of 1–1500 characters without control characters.');
  return {subject:subject.trim(),message:message.trim(),hostName:host,hubName:hub};
}
export function renderInvitationEmail({origin,to,hostName,hubName,subject,message,link}={}) {
  const draft=invitationEmailDraft({hostName,hubName,subject,message});
  const url=new URL(link),base=new URL(origin);
  if(base.origin!==origin||url.origin!==origin||url.pathname!=='/'||url.search||url.username||url.password||!/^#(?:invite\/[a-f0-9]{64}|invitation-preview)$/.test(url.hash))throw Error('Invitation links must use the configured acceptance destination.');
  const {hostName:host,hubName:hub}=draft,e=escape;
  const preheader=`${host} has invited you to ${hub} on BsideVibes.`;
  const terms='Sign in with this email, then choose whether to join. This invitation lasts seven days. Accepting starts your first seven-day trial; if you have joined before, your original end date still applies.';
  const html=`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${e(draft.subject)}</title></head>
<body style="margin:0;padding:0;background:#edeae2;color:#1c1b1a;font-family:Arial,Helvetica,sans-serif;word-wrap:break-word;overflow-wrap:anywhere;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${e(preheader)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#edeae2;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background:#fffdf7;border:1px solid #d5d0c5;border-radius:20px;overflow:hidden;">
<tr><td style="padding:24px 28px;background:#1c1b1a;color:#fffdf7;border-bottom:5px solid #d9f56b;"><span style="font-size:30px;font-weight:800;letter-spacing:-1.5px;">Bside<span style="color:#d9f56b;">.</span></span><span style="float:right;padding-top:10px;color:#d9f56b;font-size:10px;font-weight:700;letter-spacing:2px;">YOU’RE INVITED</span></td></tr>
<tr><td style="padding:34px 28px 12px;"><p style="margin:0 0 14px;color:#8e395f;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">A personal invitation from ${e(host)}</p><h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:42px;font-weight:400;line-height:1.06;letter-spacing:-1.5px;">There’s a B-side.<br>Come on in.</h1></td></tr>
<tr><td style="padding:16px 28px 26px;"><p style="margin:0 0 20px;font-size:14px;font-weight:700;color:#66615b;">${e(hub)}</p><div style="font-size:17px;line-height:1.65;white-space:pre-wrap;">${e(draft.message).replace(/\n/g,'<br>')}</div><p style="margin:22px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:22px;color:#8e395f;">${e(host)}</p></td></tr>
<tr><td style="padding:0 28px 30px;"><table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td bgcolor="#d9f56b" style="border-radius:99px;"><a href="${e(url.href)}" style="display:inline-block;padding:16px 25px;border:1px solid #b3cb4d;border-radius:99px;color:#1c1b1a;font-size:15px;font-weight:700;text-decoration:none;">Open my invitation &#8599;</a></td></tr></table><p style="margin:16px 0 0;font-size:12px;line-height:1.6;color:#66615b;">Your invitation. Your choice.</p></td></tr>
<tr><td style="padding:22px 28px;border-top:1px solid #e5e0d4;background:#f4f1e9;font-size:12px;line-height:1.65;color:#66615b;"><p style="margin:0 0 12px;">This invitation is for <strong style="color:#1c1b1a;">${e(to)}</strong>. ${e(terms)}</p><p style="margin:0;">Button not opening? Copy this link:<br><a href="${e(url.href)}" style="color:#66615b;word-break:break-all;">${e(url.href)}</a></p></td></tr>
</table><p style="margin:18px 0 0;font-size:11px;color:#77726b;letter-spacing:1px;">BSIDEVIBES · A LITTLE CLOSER</p>
</td></tr></table></body></html>`;
  const text=`${preheader}\n\nThere’s a B-side. Come on in.\n${hub}\n\n${draft.message}\n\n${host}\n\nOpen my invitation:\n${url.href}\n\nYour invitation. Your choice.\n\nThis invitation is for ${to}. ${terms}\n\nBsideVibes`;
  return {...draft,text,html};
}

// CSP authorizes only the fixed styles in the shared template. It does not
// allow arbitrary inline styles or scripts in the app or its sandboxed preview.
export function invitationPreviewStylePolicy() {
  const sample=renderInvitationEmail({origin:'https://bsidevibes.com',to:'preview@example.test',hostName:'Host',hubName:'Circle',link:'https://bsidevibes.com/#invitation-preview'}).html;
  const styles=[...new Set([...sample.matchAll(/\bstyle="([^"]+)"/g)].map(match=>match[1]))];
  return "style-src-attr 'unsafe-hashes' "+styles.map(style=>"'sha256-"+createHash('sha256').update(style).digest('base64')+"'").join(' ');
}
