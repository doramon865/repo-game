# 📊 ตัวอย่าง Google Sheet สำหรับเกมจับคู่ (MatchIt!)

## โครงสร้างข้อมูล

ชีตต้องมี **2 คอลัมน์** โดย **แถวแรกเป็น Header** เสมอ:

| คอลัมน์ | ชื่อที่รองรับ | ตัวอย่าง |
|---------|--------------|---------|
| คอลัมน์ A | `image_url` / `img` / `รูป` / `url` | `https://...` |
| คอลัมน์ B | `label` / `name` / `text` / `word` / `คำ` / `ชื่อ` | `🐱 แมว` |

---

## ตัวอย่างข้อมูลใน Google Sheet

| image_url | label |
|-----------|-------|
| https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/640px-Cat03.jpg | 🐱 แมว |
| https://upload.wikimedia.org/wikipedia/commons/thumb/2/26/YellowLabradorLooking_new.jpg/640px-YellowLabradorLooking_new.jpg | 🐶 สุนัข |
| https://upload.wikimedia.org/wikipedia/commons/thumb/7/70/Chestnut-mandibled_toucan_from_side.jpg/640px-Chestnut-mandibled_toucan_from_side.jpg | 🐦 นก |
| https://upload.wikimedia.org/wikipedia/commons/thumb/1/1f/Oryctolagus_cuniculus_Rcdo.jpg/640px-Oryctolagus_cuniculus_Rcdo.jpg | 🐰 กระต่าย |
| https://upload.wikimedia.org/wikipedia/commons/thumb/1/14/Gatto_europeo4.jpg/640px-Gatto_europeo4.jpg | 🦁 สิงโต |

> ไฟล์ CSV ตัวอย่าง: `sample_sheet.csv` (อยู่ในโฟลเดอร์เดียวกัน)

---

## วิธีนำเข้าไฟล์ CSV ไปยัง Google Sheet

1. เปิด [Google Sheets](https://sheets.google.com) → สร้างชีตใหม่
2. ไปที่ **File → Import → Upload**
3. เลือกไฟล์ `sample_sheet.csv`
4. เลือก **Replace current sheet** → คลิก **Import data**

---

## วิธีเปิดชีตให้เป็น Public CSV URL

### วิธีที่ 1 — Publish to Web (แนะนำ)

1. **File → Share → Publish to web**
2. เลือก Sheet ที่ต้องการ (เช่น `Sheet1`)
3. เปลี่ยนรูปแบบจาก `Web page` เป็น **`CSV`**
4. กด **Publish** → คัดลอก URL ที่ได้

ตัวอย่าง URL ที่ได้:
```
https://docs.google.com/spreadsheets/d/e/2PACX-XXXX/pub?gid=0&single=true&output=csv
```

### วิธีที่ 2 — Export URL (ง่ายกว่า)

นำ `Spreadsheet ID` จาก URL ของชีต แล้วใส่ใน pattern นี้:
```
https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=Sheet1
```

ตัวอย่าง:
- URL ชีตของคุณ: `https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms/edit`
- ดึง ID: `1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms`
- CSV URL: `https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms/gviz/tq?tqx=out:csv&sheet=Sheet1`

---

## แหล่งภาพฟรีที่ใช้ได้

| แหล่ง | URL Pattern | ตัวอย่าง |
|-------|------------|---------|
| **Picsum Photos** | `https://picsum.photos/seed/{คำ}/300/200` | `https://picsum.photos/seed/cat/300/200` |
| **Wikipedia Commons** | URL ตรงจากหน้า Wikipedia | ดูจาก Wikimedia Commons |
| **Unsplash (Source)** | `https://source.unsplash.com/300x200/?{คำ}` | `https://source.unsplash.com/300x200/?cat` |
| **Lorem Picsum (ID)** | `https://picsum.photos/id/{0-1000}/300/200` | `https://picsum.photos/id/237/300/200` |

> ⚠️ ต้องเป็น URL ที่เข้าถึงได้สาธารณะ ไม่ต้อง Login

---

## Tips

- ใส่ Emoji หน้าคำเพื่อให้สวยงาม เช่น `🐱 แมว`, `🌸 กุหลาบ`
- ภาพควรเป็น Landscape (กว้าง × สูง) ประมาณ 300×200px
- แนะนำให้มีอย่างน้อย **4 คู่** ขึ้นไปเพื่อความสนุก
- ชีตสามารถมีหลาย Sheet ได้ แยกใส่ชื่อ Sheet ในช่อง `ชื่อ Sheet`
