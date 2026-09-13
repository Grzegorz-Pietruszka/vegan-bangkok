// Standard Thai vegan-ordering exclusion phrases (ไม่ใส่… = "don't put in …").
// ⚠️ NATIVE-SPEAKER REVIEW REQUIRED BEFORE LAUNCH — these back the app's safety promise.
// Keys match the skipIngredients vocabulary used in the curated dish corpus.
export const EXCLUSION_PHRASES: Record<string, string> = {
  'fish sauce': 'ไม่ใส่น้ำปลา',
  'oyster sauce': 'ไม่ใส่น้ำมันหอย',
  'egg': 'ไม่ใส่ไข่',
  'fried egg': 'ไม่ใส่ไข่ดาว',
  'shrimp paste': 'ไม่ใส่กะปิ',
  'shrimp paste in curry paste': 'ไม่ใส่กะปิ',
  'shrimp-based chili jam': 'ไม่ใส่น้ำพริกเผากุ้ง',
  'dried shrimp': 'ไม่ใส่กุ้งแห้ง',
  'shrimp': 'ไม่ใส่กุ้ง',
  'crab': 'ไม่ใส่ปู',
  'pork': 'ไม่ใส่หมู',
  'minced pork': 'ไม่ใส่หมูสับ',
  'meat broth': 'ไม่ใช้น้ำซุปกระดูก',
  'chicken stock': 'ไม่ใช้น้ำซุปไก่',
  'fish balls': 'ไม่ใส่ลูกชิ้นปลา',
  'meat filling': 'ไม่ใส่ไส้หมู',
  'egg in wrapper': 'แป้งไม่มีไข่',
  'egg noodles': 'ไม่ใช้บะหมี่ไข่',
  'fish sauce in peanut sauce': 'น้ำจิ้มไม่ใส่น้ำปลา',
};
