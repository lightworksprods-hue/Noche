const axios = require('axios');
const nodemailer = require('nodemailer');

// Brevo API keys (xkeysib...) are for the HTTP API. SMTP keys (xsmtpsib...)
// must be sent through Brevo's SMTP relay instead.
const sendBrevoEmail = async ({ sender, to, subject, htmlContent }) => {
  if (process.env.BREVO_API_KEY) {
    const response = await axios.post('https://api.brevo.com/v3/smtp/email', {
      sender, to, subject, htmlContent
    }, {
      headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' }
    });
    return response;
  }

  if (!process.env.EMAIL_PASS) throw new Error('Brevo email credentials are not configured.');
  const transporter = nodemailer.createTransport({
    host: 'smtp-relay.brevo.com',
    port: 587,
    secure: false,
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
  });
  return transporter.sendMail({ from: `${sender.name} <${sender.email}>`, to, subject, html: htmlContent });
};

const sendOTPEmail = async (email, otp, tenant = {}) => {
  const { name = "Mona's Pang Noche Buena", logo, primaryColor = '#ec4899' } = tenant;
  const otpDigits = String(otp).split('').map(digit => `<span class="otp-digit">${digit}</span>`).join('');
  let absoluteLogo = logo || 'https://noche.lightworksprods.workers.dev/logo.png';
  if (logo && logo.startsWith('/')) {
    absoluteLogo = `https://hometownbrew.jasonanthonytrillo.workers.dev${logo}`;
  }

  // Brevo HTTP API authentication uses BREVO_API_KEY and does not need SMTP EMAIL_PASS.
  if (!process.env.BREVO_API_KEY && !process.env.EMAIL_PASS) {
    console.log('\n=============================================');
    console.log(`🔑 [DEV MODE] OTP Code for ${email}: ${otp}`);
    console.log('=============================================\n');
    return { success: true, message: 'Mock OTP logged to console' };
  }

  console.log('--- SENDING PREMIUM EMAIL ---');
  
  try {
    const response = await sendBrevoEmail({
      sender: { 
        name: name, 
        email: process.env.EMAIL_USER || 'jasonanthonytrillo@gmail.com'
      },
      // Prevent Brevo from replacing the verification URL with a tracking redirect.
      to: [{ email: email, contactPixelTrackingConsent: false }],
      subject: `[${otp}] Your Verification Code for ${name}`,
      htmlContent: `
              <!DOCTYPE html>
        <html>
        <head>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&display=swap');
            body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 32px 0; -webkit-font-smoothing: antialiased; }
            .wrapper { width: 100%; table-layout: fixed; background-color: #f8fafc; padding-bottom: 32px; }
            .webkit { max-width: 600px; margin: 0 auto; }
            .outer { margin: 0 auto; width: 100%; max-width: 600px; border-spacing: 0; font-family: 'Inter', sans-serif; color: #333333; }
            
            .container { background-color: #ffffff; border-radius: 24px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 18px 45px -20px rgba(15, 23, 42, 0.35); margin: 0 20px; }
            
            .header { padding: 36px 40px 34px; text-align: center; background: linear-gradient(145deg, ${primaryColor} 0%, #111827 145%); }
            .logo-container { margin-bottom: 20px; }
            .logo { height: 48px; width: auto; border-radius: 12px; }
            .eyebrow { margin: 0 0 8px; color: rgba(255,255,255,.72); font-size: 11px; font-weight: 800; letter-spacing: .18em; text-transform: uppercase; }
            .title { margin: 0; font-size: 26px; font-weight: 900; color: #ffffff; letter-spacing: -0.035em; }
            
            .content { padding: 42px 40px 36px; text-align: center; }
            .greeting { font-size: 20px; font-weight: 800; color: #0f172a; margin-top: 0; margin-bottom: 12px; }
            .text { font-size: 15px; line-height: 1.6; color: #475569; margin: 0; }
            
            .otp-label { margin: 0 0 14px; color: #64748b; font-size: 10px; font-weight: 900; letter-spacing: .2em; text-transform: uppercase; }
            .otp-container { margin: 30px 0 24px; padding: 25px 16px; background: #f8fafc; border-radius: 20px; border: 1px solid #e2e8f0; }
            .otp-digit { display: inline-block; width: 42px; height: 52px; line-height: 52px; margin: 0 3px; border-radius: 12px; background: #ffffff; border: 1px solid ${primaryColor}; color: ${primaryColor}; font-family: 'Courier New', monospace; font-size: 30px; font-weight: 900; box-shadow: 0 5px 12px rgba(15,23,42,.08); }
            
            .security-notice { font-size: 13px; color: #64748b; margin-top: 0; display: inline-block; }
            
            .divider { height: 1px; background-color: #e2e8f0; margin: 32px 0; }
            
            .footer { padding: 0 40px 34px; text-align: center; }
            .footer-text { font-size: 12px; color: #94a3b8; line-height: 1.5; margin: 0 0 8px; }
            .tenant-name { font-weight: 800; color: ${primaryColor}; }
            @media screen and (max-width: 480px) { .container { margin: 0 12px; } .header, .content { padding-left: 24px; padding-right: 24px; } .footer { padding-left: 24px; padding-right: 24px; } .otp-digit { width: 35px; height: 46px; line-height: 46px; font-size: 25px; margin: 0 1px; } }
          </style>
        </head>
        <body>
          <div class="wrapper">
            <div class="webkit">
              <table class="outer" align="center">
                <tr>
                  <td>
                    <div class="container">
                      <div class="header">
                        <div class="logo-container">
                          ${absoluteLogo ? `
                            <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin: 0 auto;">
                              <tr>
                                <td><img src="${absoluteLogo}" alt="${name}" style="height: 48px; width: auto; border-radius: 12px; display: block;"></td>
                              </tr>
                            </table>
                          ` : `
                            <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin: 0 auto;">
                              <tr>
                                <td align="center" valign="middle" style="width: 48px; height: 48px; background: ${primaryColor}; border-radius: 12px; color: white; font-weight: bold; font-size: 20px; line-height: 48px; text-align: center;">
                                  ${name.charAt(0)}
                                </td>
                              </tr>
                            </table>
                          `}
                        </div>
                        <p class="eyebrow">Account security</p>
                        <h1 class="title">Verify your account</h1>
                      </div>
                      
                      <div class="content">
                        <h2 class="greeting">Welcome to ${name}!</h2>
                        <p class="text">We received a request to sign in to your account. Enter this one-time password to continue securely.</p>
                        
                        <div class="otp-container">
                          <p class="otp-label">Your verification code</p>
                          <div aria-label="Verification code">${otpDigits}</div>
                        </div>

                        <p class="security-notice">
                          <span style="display:inline-block; width:16px; height:16px; line-height: 16px; text-align: center; background:${primaryColor}20; color:${primaryColor}; border-radius:50%; font-size:10px; font-weight:bold; margin-right:6px;">!</span>
                          This code expires in <strong style="color:#334155;">10 minutes</strong>.
                        </p>
                      </div>
                      
                      <div class="footer">
                        <div class="divider"></div>
                        <p class="footer-text">This email was intended for <strong style="color: #64748b;">${email}</strong>.</p>
                        <p class="footer-text">Powered securely by <span class="tenant-name">Mona's Pang Noche Buena</span> &copy; ${new Date().getFullYear()}</p>
                      </div>
                    </div>
                  </td>
                </tr>
              </table>
            </div>
          </div>
        </body>
        </html>
      `
    });

    console.log('✅ Premium Email Success:', response?.messageId || response?.messageIds || 'accepted');
    return response;
  } catch (error) {
    console.error('❌ Brevo API Failure:', error.response?.data || error.message);
    throw new Error(error.response?.data?.message || 'Failed to send verification email.');
  }
};

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const formatPeso = (value) => `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const sendBookedOrderEmail = async (order, tenant = {}) => {
  if (!order?.customerEmail) return { skipped: true, reason: 'missing_customer_email' };

  const { name = "Mona's Pang Noche Buena", logo, primaryColor = '#ec4899' } = tenant;
  let absoluteLogo = logo || 'https://noche.lightworksprods.workers.dev/logo.png';
  if (logo && logo.startsWith('/')) absoluteLogo = `https://hometownbrew.jasonanthonytrillo.workers.dev${logo}`;

  const orderType = order.orderType === 'delivery' ? 'Delivery' : ['take_out', 'pickup'].includes(order.orderType) ? 'Pick Up' : 'Dine In';
  const paymentStatus = order.paymentStatus === 'paid' ? 'Paid' : order.paymentStatus === 'partially_paid' ? 'Partially paid' : 'Payment pending';
  const itemsHtml = (order.items || []).map(item => `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid #e2e8f0;color:#334155;font-size:14px;">
        <strong>${escapeHtml(item.quantity)}× ${escapeHtml(item.productName)}</strong>
        ${item.size ? `<br><span style="font-size:12px;color:#64748b;">${escapeHtml(item.size)}</span>` : ''}
      </td>
      <td align="right" style="padding:12px 0;border-bottom:1px solid #e2e8f0;color:#0f172a;font-size:14px;font-weight:800;">${formatPeso(item.subtotal)}</td>
    </tr>`).join('');

  const logoHtml = absoluteLogo
    ? `<img src="${escapeHtml(absoluteLogo)}" alt="${escapeHtml(name)}" style="height:48px;width:auto;border-radius:12px;display:block;margin:0 auto;">`
    : `<div style="width:48px;height:48px;line-height:48px;margin:0 auto;border-radius:14px;background:#ffffff;color:${primaryColor};font-size:20px;font-weight:900;text-align:center;">${escapeHtml(name.charAt(0))}</div>`;

  if (!process.env.BREVO_API_KEY && !process.env.EMAIL_PASS) {
    console.log(`📧 [DEV MODE] Booked order email for ${order.customerEmail}: #${order.orderNumber}`);
    return { success: true, message: 'Mock booked order email logged to console' };
  }

  const deliveryDetails = order.orderType === 'delivery'
    ? `<div style="margin-top:18px;padding:14px 16px;border-radius:14px;background:#eff6ff;border:1px solid #bfdbfe;color:#1e3a8a;font-size:13px;"><strong>Delivery address</strong><br>${escapeHtml(order.deliveryAddress || 'Address to be confirmed')}</div>`
    : `<div style="margin-top:18px;padding:14px 16px;border-radius:14px;background:#f8fafc;border:1px solid #e2e8f0;color:#475569;font-size:13px;"><strong>${orderType} order</strong><br>Please bring your order number when claiming your order.</div>`;

  try {
    const response = await sendBrevoEmail({
      sender: { name, email: process.env.EMAIL_USER || 'jasonanthonytrillo@gmail.com' },
      to: [{ email: order.customerEmail, name: order.customerName || undefined }],
      subject: `Order #${order.orderNumber} is booked — ${name}`,
      htmlContent: `
        <!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>
          body{margin:0;padding:28px 0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a}.wrap{max-width:600px;margin:0 auto;padding:0 16px}.card{overflow:hidden;background:#fff;border:1px solid #e2e8f0;border-radius:24px;box-shadow:0 18px 45px -20px rgba(15,23,42,.35)}
          .hero{padding:34px 28px;background:linear-gradient(145deg,${primaryColor} 0%,#111827 145%);color:#fff;text-align:center}.hero h1{margin:20px 0 8px;font-size:27px;letter-spacing:-.5px}.hero p{margin:0;color:rgba(255,255,255,.78);font-size:13px}.body{padding:30px 28px}.hello{font-size:19px;font-weight:800;margin:0 0 8px}.muted{color:#64748b;font-size:14px;line-height:1.6}.number{display:inline-block;margin:18px 0 6px;padding:10px 16px;border-radius:10px;background:${primaryColor};color:#fff;font-size:18px;font-weight:900;letter-spacing:.5px}.summary{margin-top:24px;padding:18px;border:1px solid #e2e8f0;border-radius:16px;background:#fff}.summary h2{margin:0 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:1.5px;color:#64748b}.total td{padding-top:16px;font-size:16px;font-weight:900;border-bottom:0}.footer{padding:0 28px 28px;text-align:center;color:#94a3b8;font-size:12px;line-height:1.5}@media(max-width:480px){.body,.hero{padding-left:20px;padding-right:20px}.footer{padding-left:20px;padding-right:20px}}
        </style></head><body><div class="wrap"><div class="card"><div class="hero">${logoHtml}<h1>Order booked</h1><p>We’ve received and confirmed your order.</p></div><div class="body"><p class="hello">Hi ${escapeHtml(order.customerName || 'there')}!</p><p class="muted">Your order is now booked. Keep this email for your records and show the order number when you claim it.</p><div style="text-align:center"><span class="number">#${escapeHtml(order.orderNumber)}</span></div><table width="100%" cellspacing="0" cellpadding="0" style="margin-top:14px"><tr><td class="muted">Order type</td><td align="right"><strong>${orderType}</strong></td></tr><tr><td class="muted" style="padding-top:8px">Payment</td><td align="right" style="padding-top:8px"><strong>${paymentStatus}</strong></td></tr></table>${deliveryDetails}<div class="summary"><h2>Order details</h2><table width="100%" cellspacing="0" cellpadding="0">${itemsHtml}<tr class="total"><td>Total</td><td align="right">${formatPeso(order.total)}</td></tr></table></div></div><div class="footer">Questions about your order? Please contact the store and mention <strong>#${escapeHtml(order.orderNumber)}</strong>.<br><br>${escapeHtml(name)} &copy; ${new Date().getFullYear()}</div></div></div></body></html>`
    });
    console.log('✅ Booked order email sent:', response?.messageId || order.orderNumber);
    return response;
  } catch (error) {
    console.error('❌ Booked order email failure:', error.response?.data || error.message);
    throw new Error(error.response?.data?.message || 'Failed to send booked order email.');
  }
};

module.exports = { sendOTPEmail, sendBookedOrderEmail };
