const admin = require('firebase-admin');

const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT secret is missing');
const serviceAccount = JSON.parse(raw);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const messaging = admin.messaging();
const TZ = 'Asia/Seoul';

function kstParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(date);
  const out = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return { date: `${out.year}-${out.month}-${out.day}`, hour: Number(out.hour), minute: Number(out.minute) };
}
function dayNumber(start, today) {
  const startDate = new Date(`${start || today}T00:00:00+09:00`);
  const todayDate = new Date(`${today}T00:00:00+09:00`);
  const diff = Math.floor((todayDate - startDate) / 86400000) + 1;
  return Math.max(1, Math.min(30, diff));
}
function parseJson(value) {
  try { return JSON.parse(value || '{}') || {}; } catch { return {}; }
}
function hasCompletedToday(profileData, today) {
  if (!profileData) return false;
  const records = parseJson(profileData.ilbbangSeq600Records);
  const day = dayNumber(profileData.ilbbangSeq600Start, today);
  return records[`${today}|${day}`] === true;
}
function makeMessage(name, slot, date) {
  const sets = [
    [
      `${name}님, 오늘 영어 문장 30개가 아직 출석하지 않았습니다. 문장들이 단체로 민원 넣기 직전이에요.`,
      `${name}님, 영어와 눈치게임 중이신가요? 오늘 문장들이 먼저 말을 걸어왔습니다.`,
      `${name}님, 오늘의 영어 공부가 아직 미개봉 상태입니다. 지금 열어보시죠.`
    ],
    [
      `${name}님, 1차 안내 후에도 조용하시네요. 영어 문장들이 회의 소집했습니다.`,
      `${name}님, 오늘 영어 문장들이 대기표 뽑고 기다리는 중입니다. 이제 차례예요.`,
      `${name}님, 아직도 영어와 거리 두기 중인가요? 오늘은 화해할 시간입니다.`
    ],
    [
      `${name}님, 오늘 공부 마감 전 마지막 호출입니다. 내일의 내가 오늘의 나를 고발하기 전에 출발!`,
      `${name}님, 영어 문장들이 퇴근을 못 하고 있습니다. 오늘 할 일은 오늘 끝내주세요!`,
      `${name}님, 마지막 알림입니다. 오늘의 30문장, 이제 결판을 냅시다.`
    ]
  ];
  const seed = [...`${date}-${name}-${slot}`].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  return sets[slot][seed % sets[slot].length];
}

async function main() {
  const now = kstParts();
  const users = await db.collection('ilbbangUsers').get();
  const stats = {
    users: users.size, settingsMissing: 0, disabled: 0, outsideWindow: 0,
    settingsActive: 0, deviceDocs: 0, deviceCandidates: 0, invalidDevices: 0,
    missingProfiles: 0, completed: 0, alreadySent: 0, sent: 0, failed: 0
  };
  console.log(`START KST ${now.date} ${String(now.hour).padStart(2,'0')}:${String(now.minute).padStart(2,'0')} · userDocs=${stats.users}`);

  for (const userDoc of users.docs) {
    const settingsRef = userDoc.ref.collection('privateSettings').doc('notifications');
    const settingsSnap = await settingsRef.get();
    if (!settingsSnap.exists) { stats.settingsMissing++; continue; }
    const settings = settingsSnap.data();
    if (settings.enabled !== true) { stats.disabled++; continue; }

    const timeText = String(settings.time || '19:00');
    const match = /^(\d{1,2}):(\d{2})$/.exec(timeText);
    if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) {
      console.log(`INVALID_SETTING time=${timeText}`);
      stats.outsideWindow++;
      continue;
    }
    const startMinutes = Number(match[1]) * 60 + Number(match[2]);
    const currentMinutes = now.hour * 60 + now.minute;
    const elapsed = currentMinutes - startMinutes;
    if (elapsed < 0 || elapsed >= 180) {
      stats.outsideWindow++;
      console.log(`OUTSIDE_WINDOW setting=${timeText} now=${String(now.hour).padStart(2,'0')}:${String(now.minute).padStart(2,'0')} elapsedMin=${elapsed}`);
      continue;
    }
    stats.settingsActive++;
    const slot = Math.floor(elapsed / 60);

    const userData = userDoc.data();
    const profiles = Array.isArray(userData.profiles) ? userData.profiles : [];
    const profileDataMap = userData.profileData || {};
    const deviceSnaps = await userDoc.ref.collection('privateSettings').get();
    stats.deviceDocs += deviceSnaps.size;
    const deviceDocs = deviceSnaps.docs.filter(d => d.id.startsWith('device_'));
    stats.deviceCandidates += deviceDocs.length;
    if (deviceDocs.length === 0) console.log('NO_DEVICE_DOCS: 알림 설정은 켜져 있지만 device_ 문서가 없습니다.');

    for (const deviceDoc of deviceDocs) {
      const device = deviceDoc.data();
      if (!device.token || !device.profileId) { stats.invalidDevices++; console.log('INVALID_DEVICE: token 또는 profileId 누락'); continue; }
      const pData = profileDataMap[device.profileId];
      if (!pData) { stats.missingProfiles++; console.log('MISSING_PROFILE_DATA: 기기 profileId와 profileData 키가 일치하지 않습니다.'); continue; }
      if (hasCompletedToday(pData, now.date)) { stats.completed++; continue; }
      const sentSlots = device.sentSlots || {};
      const sentKey = `${now.date}_${slot}`;
      if (sentSlots[sentKey]) { stats.alreadySent++; continue; }
      const profile = profiles.find(p => p.id === device.profileId);
      const name = String(profile?.name || device.profileName || '가족').slice(0, 20);
      const fullBody = makeMessage(name, slot, now.date);
      const body = settings.lockscreen === 'private' ? '오늘의 영어 학습을 확인해 주세요.' : fullBody;
      try {
        await messaging.send({
          token: device.token,
          notification: { title: '일빵빵 가족 알림', body },
          webpush: {
            notification: { title: '일빵빵 가족 알림', body, silent: settings.sound === false, tag: `ilbbang-${now.date}-${slot}` },
            fcmOptions: { link: 'https://creep1020.github.io/I-ll-bang-1/' }
          }
        });
        await deviceDoc.ref.set({ sentSlots: { ...sentSlots, [sentKey]: true }, lastSentAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        stats.sent++;
      } catch (err) {
        stats.failed++;
        console.error(`SEND_FAILED code=${err.code || 'unknown'} message=${err.message}`);
        if (err.code === 'messaging/registration-token-not-registered' || err.code === 'messaging/invalid-registration-token') {
          await deviceDoc.ref.delete();
          console.log('INVALID_TOKEN_DEVICE_DELETED');
        }
      }
    }
  }

  console.log(`SUMMARY KST ${now.date} ${String(now.hour).padStart(2,'0')}:${String(now.minute).padStart(2,'0')} · ${Object.entries(stats).map(([k,v]) => `${k}=${v}`).join(' ')}`);
}
main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
