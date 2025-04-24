import { GoogleAuth } from 'google-auth-library';
import axios from 'axios';
import path from 'path';

const PROJECT_ID = 'tercescrow-e003b';
const SERVICE_ACCOUNT_PATH = path.join(__dirname, '../service-account.json');
const FCM_ENDPOINT = `https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages:send`;

export async function getAccessToken(): Promise<string> {
  const auth = new GoogleAuth({
    keyFile: SERVICE_ACCOUNT_PATH,
    scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
  });

  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  return tokenResponse.token!;
}

export async function sendPushNotification(
  fcmToken: string,
  title: string,
  body: string,
  userId: string
): Promise<any> {
  const accessToken = await getAccessToken();

  const payload = {
    message: {
      token: fcmToken,
      notification: {
        title,
        body,
      },
      data: {
        title,
        body,
        userId,
      },
    },
  };

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };

  try {
    const response = await axios.post(FCM_ENDPOINT, payload, { headers });
    console.log('✅ Notification sent:', response.data);
    return response.data;
  } catch (error: any) {
    console.error('❌ FCM Error:', error.response?.data || error.message);
    throw new Error(error.response?.data?.error?.message || error.message);
  }
}
