# Historical Murcia models

These exports are retired prototypes, preserved for reference outside Vite's
public asset tree. On 2026-09-15 the project owner confirmed that only the latest
city model is in use. This archive is not copied into dist or deployed.

The current city is public/models/murcia-v7.glb, validated by checks/city-asset.ts.
The satellite and logo models are independent active assets and remain public.

| File | Bytes | SHA-256 |
|---|---:|---|
| city-prototype.glb | 3337744 | 88dc5ae09f8eebd8b0de5a2566a1def472510df91ffcac8b1d68003bc8e0dace |
| murcia-v2-vertexcolor.glb | 3912228 | 9d69857f4bf87e6963fcb858fe2b84fa2a12280cf1618da5d1faa3a2c84da070 |
| murcia-v5.glb | 3323824 | bcf5fd071ffd9d7816cf5cc18b41076e08f66e1e1a789bf3243bedd627327300 |

The files are byte-identical to their former public/models copies in commit
a983709. Their former /models URLs are retired; historical documentation keeps
those names as evidence of the exports used at the time.

For inspection, open an archived GLB directly in Blender or a local GLB viewer.
Do not point production configuration at this directory. A future export intended
for delivery must be placed in public/models and pass the current asset contract.
