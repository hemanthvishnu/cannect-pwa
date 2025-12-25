/**
 * Phase 6: Email Service - Send Temporary Passwords
 * 
 * Uses Resend API to email users their temporary passwords
 * 
 * TEST MODE: All emails go to hello@hemanthvishnu.com
 * Set TEST_MODE = false to send to actual users
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================
// CONFIGURATION
// ============================================================

const RESEND_API_KEY = 're_dLUs95Z2_481fJ3KnpJefTSTPKQbs3xaM';
const FROM_EMAIL = 'Cannect <noreply@cannect.space>';

// TEST MODE - Always send to this email instead of actual users
const TEST_MODE = true;
const TEST_EMAIL = 'hello@hemanthvishnu.com';

// How many emails to send (0 = all)
const LIMIT = 1; // Start with 1 test email

// ============================================================
// LOAD USER MAPPINGS
// ============================================================

const userMappingsPath = path.join(__dirname, 'migration-users.json');
const userMappingsData = JSON.parse(fs.readFileSync(userMappingsPath, 'utf-8'));
const userMappings = userMappingsData.success || [];

console.log(`📋 Loaded ${userMappings.length} migrated users`);
console.log(`📧 Test mode: ${TEST_MODE ? 'ON - all emails to ' + TEST_EMAIL : 'OFF - sending to real users'}\n`);

// ============================================================
// EMAIL TEMPLATE
// ============================================================

function generateEmailHtml(user) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to the New Cannect</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #10B981 0%, #059669 100%); padding: 40px 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">🌿 Cannect</h1>
              <p style="margin: 10px 0 0; color: rgba(255,255,255,0.9); font-size: 16px;">The Cannabis Community</p>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <h2 style="margin: 0 0 20px; color: #18181b; font-size: 22px; font-weight: 600;">
                Welcome to the New Cannect! 🎉
              </h2>
              
              <p style="margin: 0 0 20px; color: #52525b; font-size: 16px; line-height: 1.6;">
                Hi <strong>${user.handle.split('.')[0]}</strong>,
              </p>
              
              <p style="margin: 0 0 20px; color: #52525b; font-size: 16px; line-height: 1.6;">
                We've upgraded Cannect to a new decentralized platform! Your account, posts, followers, and all your data have been migrated.
              </p>
              
              <p style="margin: 0 0 15px; color: #52525b; font-size: 16px; line-height: 1.6;">
                Here are your new login credentials:
              </p>
              
              <!-- Credentials Box -->
              <table role="presentation" style="width: 100%; background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; margin: 0 0 25px;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 10px; color: #166534; font-size: 14px;">
                      <strong>Handle:</strong><br>
                      <span style="font-family: monospace; font-size: 16px; color: #15803d;">@${user.handle}</span>
                    </p>
                    <p style="margin: 0; color: #166534; font-size: 14px;">
                      <strong>Temporary Password:</strong><br>
                      <span style="font-family: monospace; font-size: 18px; color: #15803d; letter-spacing: 1px;">${user.tempPassword}</span>
                    </p>
                  </td>
                </tr>
              </table>
              
              <!-- CTA Button -->
              <table role="presentation" style="width: 100%; margin: 0 0 25px;">
                <tr>
                  <td align="center">
                    <a href="https://cannect.space" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #10B981 0%, #059669 100%); color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px;">
                      Login to Cannect →
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 0 0 15px; color: #52525b; font-size: 16px; line-height: 1.6;">
                <strong>⚠️ Important:</strong> Please change your password after logging in by going to Settings.
              </p>
              
              <p style="margin: 0 0 20px; color: #52525b; font-size: 16px; line-height: 1.6;">
                If you have any questions, reply to this email or reach out to us at <a href="mailto:support@cannect.space" style="color: #10B981;">support@cannect.space</a>
              </p>
              
              <p style="margin: 0; color: #52525b; font-size: 16px; line-height: 1.6;">
                Happy growing! 🌱<br>
                <strong>The Cannect Team</strong>
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f4f4f5; padding: 20px 30px; text-align: center;">
              <p style="margin: 0 0 10px; color: #71717a; font-size: 14px;">
                © 2025 Cannect. All rights reserved.
              </p>
              <p style="margin: 0; color: #a1a1aa; font-size: 12px;">
                You're receiving this because your account was migrated to the new Cannect platform.
              </p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
}

function generateEmailText(user) {
  return `
Welcome to the New Cannect! 🌿🎉

Hi ${user.handle.split('.')[0]},

We've upgraded Cannect to a new decentralized platform! Your account, posts, followers, and all your data have been migrated.

Here are your new login credentials:

Handle: @${user.handle}
Temporary Password: ${user.tempPassword}

Login at: https://cannect.space

⚠️ IMPORTANT: Please change your password after logging in by going to Settings.

If you have any questions, reply to this email or reach out to us at support@cannect.space

Happy growing! 🌱
The Cannect Team

---
© 2025 Cannect. All rights reserved.
You're receiving this because your account was migrated to the new Cannect platform.
`;
}

// ============================================================
// SEND EMAIL VIA RESEND
// ============================================================

async function sendEmail(to, subject, html, text) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [to],
      subject: subject,
      html: html,
      text: text
    })
  });
  
  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.message || `HTTP ${response.status}`);
  }
  
  return data;
}

// ============================================================
// MAIN
// ============================================================

async function sendMigrationEmails() {
  console.log('='.repeat(60));
  console.log('📧 SENDING MIGRATION EMAILS');
  console.log('='.repeat(60) + '\n');
  
  const results = {
    success: [],
    failed: []
  };
  
  const toProcess = LIMIT > 0 ? userMappings.slice(0, LIMIT) : userMappings;
  
  for (let i = 0; i < toProcess.length; i++) {
    const user = toProcess[i];
    
    // Determine recipient
    const recipient = TEST_MODE ? TEST_EMAIL : user.email;
    const subject = TEST_MODE 
      ? `[TEST - ${user.email}] Welcome to the New Cannect!`
      : 'Welcome to the New Cannect! 🌿 Your Login Credentials';
    
    console.log(`[${i + 1}/${toProcess.length}] ${user.handle}`);
    console.log(`   To: ${recipient}`);
    
    try {
      const html = generateEmailHtml(user);
      const text = generateEmailText(user);
      
      const result = await sendEmail(recipient, subject, html, text);
      
      console.log(`   ✅ Sent! ID: ${result.id}\n`);
      
      results.success.push({
        handle: user.handle,
        email: user.email,
        sentTo: recipient,
        resendId: result.id
      });
      
      // Small delay to avoid rate limiting
      if (i < toProcess.length - 1) {
        await new Promise(r => setTimeout(r, 200));
      }
      
    } catch (error) {
      console.log(`   ❌ Failed: ${error.message}\n`);
      results.failed.push({
        handle: user.handle,
        email: user.email,
        error: error.message
      });
    }
  }
  
  // Summary
  console.log('='.repeat(60));
  console.log('📊 EMAIL SUMMARY');
  console.log('='.repeat(60) + '\n');
  
  console.log(`   ✅ Sent: ${results.success.length}`);
  console.log(`   ❌ Failed: ${results.failed.length}`);
  
  if (TEST_MODE) {
    console.log(`\n   ⚠️  TEST MODE - All emails sent to ${TEST_EMAIL}`);
    console.log(`   Set TEST_MODE = false to send to actual users`);
  }
  
  // Save results
  const outputPath = path.join(__dirname, 'migration-emails.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n💾 Results saved to: ${outputPath}`);
  
  console.log('\n✅ Done');
}

sendMigrationEmails().catch(console.error);
