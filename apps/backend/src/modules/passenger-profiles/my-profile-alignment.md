# Feature 7: My Profile alignment

เทียบกับเอกสาร “Feature 7 (customer and passenger profiles, security screening): fixes and suggestions” ที่ผู้ใช้ส่งให้ โดยจำกัดงานที่หน้า My Profile, Edit Profile, Saved Passengers และ API ฝั่ง customer ที่หน้านี้ใช้ ไม่เพิ่มหน้า staff, watchlist หรือ screening queue และไม่รัน proposed SQL แทน migration กลาง

## ส่วนที่ตรงแล้วและสิ่งที่ปรับ

| ข้อในเอกสาร                      | การทำงานใน My Profile                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2: identity lock                 | วันเกิด เพศ และสัญชาติตั้งค่าครบครั้งเดียวผ่าน PUT /customers/me/identity หลังจากนั้นเรียกซ้ำได้ 409 และ PUT โปรไฟล์ไม่รับสามช่องนี้ (400) ส่วนผู้โดยสารที่บันทึกไว้ต้องระบุทั้งสามอย่างตอนสร้าง และ PUT ไม่รับการเปลี่ยนฟิลด์ที่ล็อก ไม่มี customer endpoint สำหรับแก้ไขแทน staff                                                                                                                     |
| 3: duplicates and name key       | ยอมรับคนเดียวกันหลายแถวเมื่อคนละ customer สร้าง ไม่ deduplicate ข้ามบัญชี เพิ่มตัวช่วย `nameKey` ให้ตรง SQL expression: first + last แล้วเหลือเพียง A–Z/0–9 ตัวพิมพ์ใหญ่ ตัวช่วยนี้ยังไม่ใช่ระบบจดจำ false-positive                                                                                                                                                                                    |
| 6: normalized identity           | เพศเป็น M/F/X, ประเทศตรวจ ISO alpha-2 แล้วเก็บตัวพิมพ์เล็ก, พาสปอร์ตลบช่องว่าง/ขีดแล้วเก็บ A–Z/0–9 backend แปลง Latin accents และ punctuation ที่รองรับให้เป็น ASCII ก่อนตรวจชื่อ โดยเก็บชื่อท้องถิ่นแยกต่างหาก                                                                                                                                                                                        |
| 7: customer identity and sign-in | ชื่อ/วันเกิด/เพศ/สัญชาติ/พาสปอร์ตอยู่ใน passenger ของเจ้าของบัญชี เพิ่มช่องชื่อท้องถิ่นและพาสปอร์ตใน Edit Profile และการแมป API ให้ครบ การสร้าง user/passenger/customer เดิมอยู่ใน transaction และใช้ unique Clerk ID + P2002 recovery ป้องกัน concurrent sign-in เพิ่มการอ่าน verified primary email จาก Clerk ทุก customer sign-in ไม่เปลี่ยนเส้นทาง staff และไม่เขียนทับชื่อพาสปอร์ตจากชื่อใน Clerk |
| 8: saved passengers              | ไม่มี self link; เจ้าของบัญชีใช้ customer.passenger_id นำผู้โดยสารออกด้วย is_saved=false โดยคงแถวและประวัติ อธิบาย relationship ว่าเป็นความสัมพันธ์ของผู้โดยสารต่อเจ้าของบัญชี เช่น Parent หมายถึงผู้โดยสารเป็นพ่อ/แม่ของเจ้าของบัญชี                                                                                                                                                                  |
| 11: privacy and audit            | เปิดข้อมูลโปรไฟล์/ผู้โดยสารและส่งข้อมูลส่วนตัวกลับจากการบันทึก จะเพิ่ม audit_log แบบ append-only ด้วย action=view_sensitive ก่อนส่ง response ให้เจ้าของบัญชี รายการหลายคนใช้ bulk insert เฉพาะหน้าที่ส่งกลับ หาก audit ไม่สำเร็จจะไม่ส่งข้อมูลส่วนตัวกลับ ไม่เก็บ passport/DOB/ชื่อหรือ before/after values ใน audit หน้า overview ซ่อนพาสปอร์ตบางส่วน; เจ้าของข้อมูลเปิดเลขเต็มได้ใน Edit Profile     |
| 13: validation                   | ชื่อต้องไม่ว่างและใช้ Latin passport spelling, ประเทศและพาสปอร์ตตรวจใน backend, วันเกิดต้องเป็นวันที่จริง ตั้งแต่ 1900-01-01 และไม่เกินวันปัจจุบัน ล็อก identity ที่ backend; client validation ไม่ใช้แทน server validation                                                                                                                                                                            |

การเพิ่มข้อมูลเจ้าของบัญชีใช้คอลัมน์ passenger ที่มีอยู่ ไม่เปลี่ยน schema หรือ migration และไม่เพิ่ม seat/meal preferences กลับเข้ามา

## จุดที่ยังไม่ใช่การทำงานที่เสร็จแล้ว

1. **Re-screen เมื่อ identity เปลี่ยน (ข้อ 2):** ใน checkout นี้มี schema screening_check/screening_review แต่ยังไม่มีโมดูล booking 3b, ความสัมพันธ์ผู้โดยสารกับ upcoming flights หรือบริการ screening ที่ export ให้เรียก จึงยังไม่มีการตรวจซ้ำหลังแก้ชื่อ/พาสปอร์ต และไม่มี no-op ที่อ้างว่าตรวจแล้ว จุดเชื่อมต้องส่ง passenger ID หลังการแก้ Latin/local names, passport หรือการตั้ง identity ครั้งแรก โดยใช้ trigger_point=identity_change ไปยัง screening ของเที่ยวบินที่ยังไม่ออกตาม simulation clock การแก้ค่าที่ไม่เปลี่ยนจริงหรือแก้ phone/photo ไม่ควรสร้างการตรวจซ้ำ ต้องออกแบบการส่งต่อให้คงทนกับ transaction/retry ร่วมกับทีม screening/3b; ไม่ใช้ screening_check เก่าแทนรายชื่อเที่ยวบินที่จองจริง
2. **Simulation date (ข้อ 13):** ยังไม่มี simulation-clock provider ใน repository การตรวจ DOB ปัจจุบันจึงเทียบกับเวลาจริง ต้องรับวันที่จำลองจากบริการกลางที่ทีมกำหนด ไม่รับวันที่ที่ browser ส่งมาเพื่อข้าม validation และไม่เพิ่มวันจำลองปลอมใน feature นี้
3. **ชื่อไทย (ข้อ 6):** ยังไม่มีบริการถอดชื่อไทยที่ทีมตกลงให้ใช้ ระบบไม่เดาการสะกดชื่อพาสปอร์ตจากภาษาไทย เพราะอาจต่างจากเอกสารจริง ให้กรอก Latin spelling ที่พิมพ์ในพาสปอร์ตและเก็บชื่อไทยใน local-name fields ส่วนการถอด Latin accents รองรับแล้ว การถอดไทยอัตโนมัติยังต้องตกลงบริการ/มาตรฐานก่อน และไม่อ้างว่ามีอยู่แล้ว
4. **Auth provisioning (ข้อ 7):** transaction และ unique-ID race recovery มีอยู่แล้ว แต่ไม่ได้เปลี่ยนเป็น raw INSERT ... ON CONFLICT หรือทำ data-moving migration; นี่เป็นงานประสาน Feature 1/Database Team ไม่เปลี่ยน seed หรือข้อมูลเดิม เพิ่มการตรวจชื่อ Latin จาก Clerk ก่อนสร้าง passenger/customer แล้ว หากชื่อไม่พร้อมให้สร้างเฉพาะ user รอกรอกชื่อพาสปอร์ตจริงใน First sign-in โดยไม่ใช้ email เป็นชื่อ; profile write endpoints ตรวจชื่อทุกครั้ง

## นอกขอบเขต My Profile ตามที่ผู้ใช้กำหนด

- ข้อ 1, 4, 5: เกณฑ์ matching, append-only screening runs/reviews, denied/held/flagged, false-positive memory และ fail-open/fail-closed
- ข้อ 8 ฝั่ง staff/3b: สร้างผู้โดยสารแทนลูกค้า, booking autocomplete ที่รวมเจ้าของบัญชี, เขียน last_booked_at และบังคับ DOB ก่อน booking
- ข้อ 9–10: screening queue, booking/flight dependencies, watchlist และการ clear/reactivate
- ข้อ 11 ฝั่ง staff: role security, staff search masking, watchlist/review access
- ข้อ 12–13 ส่วนเอกสาร/diagram และ screening outcome/review rules

ไฟล์นี้บันทึกข้อที่ต้องประสานต่ออย่างชัดเจน ไม่ได้หมายความว่าส่วน screening หรือ staff ถูกนำมาทำเสร็จพร้อมหน้า My Profile

## ขอบเขตที่ยึดในการแก้ครั้งนี้

ยึด text ไฟล์แรก “fixes and suggestions” และ docs กลางเป็นหลัก ไม่รวมข้อเปลี่ยนของ Iteration-03: ค่า Weak 0.7, copied flight_dep_at และหนึ่ง review ต่อ check เป็นข้อเสนออ้างอิงของไฟล์แรกเท่านั้น ยังไม่มี screening service ที่นำเกณฑ์เหล่านี้ไปรันจริง

- API ฝั่ง customer ใช้ /api/customers/me และ /api/customers/me/passengers; อัปเดตด้วย PUT พร้อมปรับ frontend และ HTTP tests ให้ตรงกัน
- relationship ไม่บังคับและเก็บ null เมื่อไม่ระบุ; ลูกค้าล้างค่าความสัมพันธ์ได้
- เพิ่ม PUT /api/customers/me/photo สำหรับอ่านรูปเจ้าของบัญชีจาก Clerk; frontend ยังคงอัปโหลด/ลบ asset ผ่าน Clerk SDK แล้ว sync โดยไม่สร้างระบบจัดเก็บรูปใหม่
- ปรับ docs กลางให้สะท้อน feature folders และ centralized schema ที่มีจริง
- Booking autocomplete ที่ UNION เจ้าของบัญชี, การเรียง last_booked_at และผู้เขียนค่าจาก 3b จะทำพร้อม integration กับ booking; ข้อความ UI ปัจจุบันไม่อ้างว่า autocomplete ใช้งานแล้ว
- ไม่แก้ shared auth, schema, migrations, seed หรือ staff; data-moving migration/ON CONFLICT ต้องประสาน Platform และ Database Team

## ผลตรวจการแก้ครั้งนี้ (22 ตุลาคม 2026)

- Backend tests: 7 suites / 138 tests ผ่านทั้งหมด (HTTP tests รันซ้ำหลังอนุญาต localhost)
- Lint และ build ของ backend/customer-web ผ่าน
- Format check ทั้งแอปยังรายงานไฟล์เดิมนอกขอบเขต: customer routes 6 ไฟล์ และ backend shared/config 27 ไฟล์; ไฟล์ที่แก้ใน feature จัดรูปแบบด้วย config ของแต่ละแอป
- ไม่ได้ทดสอบ upload/remove รูปหรือส่ง OTP กับบัญชีจริงในการแก้ครั้งนี้

## ลดเวลารอหน้า Profile

หน้าเปิดด้วย GET /api/customers/me ซึ่งอ่านฐานข้อมูลและทำ sensitive-view audit ตามเดิม แทนการเรียก POST sync-identity ที่รอ Clerk และเขียนข้อมูลทุกครั้ง Saved Passengers โหลดต่อจากข้อมูลโปรไฟล์ การเปลี่ยนอีเมล/รูปและปุ่ม retry ของรายการที่ sync ไม่สำเร็จยังใช้ Clerk และ backend ตรวจข้อมูลเหมือนเดิม การ reload อ่านค่าที่ persist สำเร็จล่าสุด ไม่ใช้เป็นการ retry sync อัตโนมัติ ส่วน auth ตอน sign-in ยัง sync verified email ตามเดิม ไม่แก้ flow ของ auth และไม่เปลี่ยนงาน screening/autocomplete ที่พักไว้
