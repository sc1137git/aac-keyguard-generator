# AAC Keyguard Generator

將 iPad 上的 AAC（輔助與替代溝通）畫面截圖，轉換成可供雷射切割／3D 列印前處理使用的 Keyguard 幾何。

> Demo：https://aac-keyguard-generator.onrender.com

## 功能

- 上傳完整 iPad 螢幕範圍的 AAC 截圖
- 自動辨識規則按鈕格線
- 保留一般按鈕與「點擊以添加按鈕」等虛線預留格
- 手動新增、刪除、移動與調整孔位
- 手動畫孔與拖曳時提供邊緣／中心吸附對齊線
- 黑白 Keyguard 即時預覽
- 支援 iPad 7 / 8 / 9 / 10 預設尺寸
- 外框四角圓角可調
- 主體厚度可調
- 可選四個固定耳朵，耳朵厚度可調
- 有耳朵時：先鏡像孔位，再於鏡像後的模型加入耳朵
- 匯出 SVG 與 STL

## iPad 螢幕尺寸基準

| 型號 | 原生解析度 | 使用的實體螢幕座標 |
| --- | --- | --- |
| iPad 7 / 8 / 9 | 2160 × 1620 px | 207.82 × 155.86 mm |
| iPad 10 | 2360 × 1640 px | 227.06 × 157.79 mm |

上傳截圖只用來取得相對座標。實體輸出尺寸由所選 iPad 型號決定，不直接以圖片檔目前的像素大小換算，因此經過通訊軟體縮圖的截圖仍可使用。

## 預設列印參數

- 無固定耳朵：主體厚度預設 3 mm
- 有固定耳朵：主體厚度預設 5 mm
- 固定耳朵厚度預設 0.8 mm
- 外框四角圓角預設 6 mm

以上厚度可在介面中自行調整。

固定耳朵目前為左側 2 個、右側 2 個的圓角矩形耳朵，中央區域刻意留空，以避免遮擋舊款 iPad 的前鏡頭／Home 鍵區域。

## 使用流程

1. 選擇 iPad 型號。
2. 上傳 AAC 全螢幕截圖。
3. 系統自動辨識孔位。
4. 在「原圖＋孔位」中修正誤判或漏判。
5. 切到「黑白預覽」確認 Keyguard 外形。
6. 視需要加入固定耳朵並調整厚度。
7. 匯出 SVG 或 STL。

## 隱私

目前程式不建立帳號、資料庫或使用者資料表。上傳的 AAC 截圖只用於當次影像辨識；應用程式程式碼本身不會把上傳圖片寫入資料庫或持久化儲存。

若自行部署，仍應依自己的主機、反向代理、日誌與雲端平台設定確認實際資料保留政策。

## 本機執行

需要 Python 3.12（建議）。

```bash
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

開啟：`http://localhost:8000`

## Docker

```bash
docker build -t aac-keyguard-generator .
docker run --rm -p 10000:10000 aac-keyguard-generator
```

開啟：`http://localhost:10000`

## Render

Repository 內含 `render.yaml` 與 `Dockerfile`，可用 Render 建立 Web Service。正式示範站目前為：

https://aac-keyguard-generator.onrender.com

## 專案結構

```text
.
├─ app/
│  ├─ main.py              # FastAPI、影像辨識、STL 生成
│  └─ static/
│     ├─ index.html        # 操作介面
│     ├─ app.js            # 前端編修、預覽、SVG/STL 呼叫
│     └─ style.css
├─ Dockerfile
├─ render.yaml
├─ requirements.txt
├─ LICENSE
└─ README.md
```

## 目前限制

自動辨識是為規則型 AAC 按鈕版面設計，並不保證每張截圖都能完全正確。正式列印前請務必在畫面上檢查孔位，並確認輸出的實體尺寸、固定方式、保護殼厚度、3D 印表機校正與材料收縮量。

## License

MIT License。詳見 [`LICENSE`](LICENSE)。
