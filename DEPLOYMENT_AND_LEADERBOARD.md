# Elemental Lab: การติดตั้งหลายเครื่องและ Leaderboard กลาง

## สถาปัตยกรรมที่แนะนำ

```text
คอมของนักเรียน (Browser + Webcam + Teachable Machine)
                |
              HTTPS
                v
Cloudflare Pages/Worker  ----  Cloudflare D1
   หน้าเกม + REST API          นักเรียน / session / kill events
```

การประมวลผลภาพและ Pose ควรอยู่ใน Browser ของนักเรียนเหมือนเดิม ไม่ส่งภาพจากกล้องขึ้น Server ส่งเฉพาะเหตุการณ์ขนาดเล็กเมื่อฆ่ามอนสเตอร์สำเร็จ เช่น student code, monster, score, confidence และเวลา

## ทำไมไม่ใช้ MQTT เป็นฐานข้อมูล

- MQTT คือ protocol แบบ publish/subscribe ส่วน HiveMQ คือ MQTT broker
- เหมาะกับ sensor, ESP32, อุปกรณ์ IoT และการกระจาย event แบบ real-time
- Broker อาจเก็บ session หรือ message ที่ยังส่งไม่สำเร็จ แต่ไม่ควรใช้แทนฐานข้อมูลคะแนนถาวร
- เกม webcam อย่างเดียวใช้ HTTPS REST API + D1 ง่ายกว่า ปลอดภัยกว่า และดูแลน้อยกว่า
- หากเพิ่ม ESP32 ภายหลัง ให้ ESP32 publish ไป HiveMQ แล้วมี Worker/consumer เขียนข้อมูลที่ต้องเก็บลง D1

## การเปิดเกมจากเครื่องอื่น

### วิธีใช้งานจริงที่แนะนำ

1. เก็บ source code ใน private GitHub repository
2. เชื่อม repository กับ Cloudflare Pages
3. Build command: `npm run build`
4. Output directory ของโปรเจกต์นี้: `dist/client`
5. เปิด URL แบบ `https://<project>.pages.dev` จากทุกเครื่อง
6. อนุญาต Camera เมื่อ Browser ถาม
7. ใส่ URL ของ Teachable Machine model ที่มี Class `Ice`, `Fire`, `Thunder`, `Stone`

HTTPS สำคัญ เพราะ Browser ไม่เปิด webcam ผ่าน HTTP ทั่วไป ยกเว้น `localhost`

### วิธีรันแยกในแต่ละเครื่องแบบไม่ Deploy

ติดตั้ง Node.js แล้วคัดลอกทั้งโฟลเดอร์ จากนั้นรัน:

```bash
npm ci
npm run dev
```

เปิด `http://localhost:5173` บนเครื่องเดียวกัน วิธีนี้ใช้กล้องได้เพราะเป็น localhost แต่การอัปเดตหลายเครื่องและ Leaderboard กลางจะดูแลยากกว่าการใช้ URL กลาง

## ข้อมูล Leaderboard

ควรให้ครูสร้าง `student_code` หรือรหัสเล่นเกมแบบไม่ใช้ชื่อจริงเต็มของนักเรียน

```sql
CREATE TABLE students (
  id TEXT PRIMARY KEY,
  student_code TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  classroom TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE game_sessions (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at TEXT,
  FOREIGN KEY (student_id) REFERENCES students(id)
);

CREATE TABLE monster_kills (
  event_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  monster TEXT NOT NULL,
  final_spell TEXT NOT NULL,
  confidence INTEGER NOT NULL CHECK (confidence BETWEEN 95 AND 100),
  score INTEGER NOT NULL,
  killed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES game_sessions(id)
);

CREATE INDEX idx_kills_session ON monster_kills(session_id);
CREATE INDEX idx_sessions_student ON game_sessions(student_id);
```

`event_id` ต้องไม่ซ้ำ เพื่อป้องกันการนับ kill ซ้ำเมื่ออินเทอร์เน็ตหลุดแล้ว Browser ส่ง event ซ้ำ

## API ขั้นต่ำ

- `POST /api/sessions` เริ่ม session จาก student code
- `POST /api/kills` บันทึกหนึ่ง kill ด้วย `event_id`
- `GET /api/leaderboard?classroom=...` คืนอันดับตามจำนวน kill และคะแนน
- `POST /api/sessions/:id/end` ปิด session

ตัวอย่าง query:

```sql
SELECT s.display_name,
       s.classroom,
       COUNT(k.event_id) AS monsters_killed,
       COALESCE(SUM(k.score), 0) AS total_score
FROM students s
LEFT JOIN game_sessions gs ON gs.student_id = s.id
LEFT JOIN monster_kills k ON k.session_id = gs.id
WHERE (? IS NULL OR s.classroom = ?)
GROUP BY s.id
ORDER BY monsters_killed DESC, total_score DESC
LIMIT 20;
```

## ความปลอดภัยและข้อมูลเด็ก

- ไม่ส่งหรือบันทึกภาพ webcam, skeleton หรือไฟล์ฝึก Pose
- ใช้ student code / nickname แทนชื่อจริง ถ้าไม่จำเป็น
- ห้ามใส่ D1 credential หรือ Cloudflare API token ใน frontend
- Endpoint เขียนคะแนนต้องตรวจ session token, จำกัดความถี่ และใช้ idempotent `event_id`
- Server ควรตรวจ confidence 95–100 และข้อมูลชนิดมอนสเตอร์/เวทซ้ำอีกครั้ง
- มีหน้าครูสำหรับล้าง session ทดลองและ export คะแนน โดยต้องมีสิทธิ์แยกจากนักเรียน

## ขั้นต่อไปก่อนเปิด Leaderboard จริง

ต้องกำหนดวิธีระบุตัวนักเรียนหนึ่งแบบ:

1. รหัสนักเรียนที่ครูเตรียมไว้
2. ชื่อเล่น + ห้องเรียน
3. QR code สำหรับเข้า session

แนะนำแบบที่ 1 หรือ 3 เพราะลดชื่อซ้ำและไม่ต้องเก็บข้อมูลส่วนตัวเกินจำเป็น
