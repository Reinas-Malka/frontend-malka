# Contrato con el backend

`openapi.json` es una foto del OpenAPI de `backend-malka` (FastAPI). De ahí sale
`src/api/esquema.d.ts`, y `src/tipos/dominio.ts` toma de ese archivo los tipos de
las entidades que ya tienen endpoint. Si el backend cambia un campo, el build
del front falla en el lugar exacto: así no se desalinean.

Para actualizarlo, con el backend en `../backend-malka` y su venv activo:

```bash
cd ../backend-malka && python -c "import json; from app.main import app; json.dump(app.openapi(), open('../frontend-malka/contrato/openapi.json', 'w'), ensure_ascii=False, indent=1, sort_keys=True)"
cd ../frontend-malka && npm run contrato:tipos
```

`openapi-typescript` corre con `npx` y no es dependencia: su peer pide
TypeScript 5 y el proyecto usa 6. El archivo generado se commitea.
