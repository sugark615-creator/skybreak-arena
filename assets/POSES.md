# キャラクターのコマアニメーション

内蔵 image_gen で各キャラクターの参照画像から生成しました。各 PNG は 4 列 × 3 行の 12 ポーズです。ファイル: volt-poses-v1.png / rift-poses-v1.png / kirby-poses-v1.png / brick-poses-v1.png / spring-poses-v1.png。

画像は固定の縦横比で描画します。メッシュ変形・非等方拡大は使用しません。背景のマゼンタはゲーム起動時にクロマキーで抜きます。

## 生成プロンプト

```
Use case: stylized-concept. Asset type: production 2D fighting game sprite sheet. Input image is CHARACTER IDENTITY reference only, not a pose to warp. Draw NEW hand-drawn animation poses of this SAME character. Output one transparent PNG sprite sheet, EXACTLY 4 columns and 3 rows, 12 equal-sized square cells, no margins between cells, landscape 4:3 aspect. Each cell must contain exactly one complete full-body pose; all facing RIGHT; all have identical head size and body proportions; align torso centers horizontally in cells and feet baseline at 88% cell height. Generous 12% padding within every cell; no limbs crossing cell borders. Clean cel-shaded game illustration, crisp outlines; preserve reference outfit, face, species, colors. Truly transparent alpha background, NO checkerboard painted in, no text, no labels, no borders, no floor, no motion trails.
FRAME ORDER left to right then top to bottom:
Row 1: (0) relaxed combat idle with fists ready; (1) RUN contact left foot forward right foot back, right arm forward left arm back; (2) RUN passing pose left knee bent rising, feet under hips, arms changing sides; (3) RUN opposite contact right foot forward left foot back, left arm forward.
Row 2: (4) RUN opposite passing pose right knee bent rising, arms opposed; (5) JUMP launching upward with one arm lifted and trailing foot stretched back, clear real knee/elbow bends; (6) JUMP apex compact knees tucked below body, arms spread for balance; (7) FALL landing-ready legs extended below, knees slightly bent, arms out.
Row 3: (8) straight punch fully extended to the right, torso twists; (9) forward high kick to the right with supporting knee bent, arms balancing; (10) upward uppercut with bent knees and twisting torso; (11) two-handed energy shot with palms extended right.
IMPORTANT: actual redrawn limb articulation, different silhouettes in every cell, no stretched versions of a single image. Keep character scale consistent even in crouched poses.
Character sheet: [volt / rift / kirby / brick / spring]. Preserve this reference character exactly; face right even if the reference faces left.
```

## 背景調整プロンプト

```
Use case: background-extraction. Edit target: the attached 12-pose sprite sheet. Change ONLY the background: remove every bit of the grey checkerboard and replace with a completely flat solid pure chroma-key magenta RGB(255,0,255), hex #FF00FF. No gradient, no shadow, no texture, no checkerboard anywhere. Keep all TWELVE character drawings, their pose, proportions, color, size, coordinates, grid arrangement, and whole image dimensions EXACTLY unchanged. Do not redraw or alter the characters. No text, no frame outlines. The game engine will key out this single background color. Maintain crisp antialiased edges.
```
