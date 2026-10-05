---
name: feature
description: Flujo completo para construir una feature de WizyDoc con los subagentes, de plan a pruebas. Úsalo cuando el usuario escriba /feature o pida construir una feature de punta a punta.
---
Para la feature descrita en $ARGUMENTS:

1. Delega al **planner**. Si devuelve preguntas abiertas, muéstramelas,
   espera mis respuestas y vuelve a delegarle con ellas.
2. Muéstrame `docs/features/<slug>/plan.md` y, si existe, `mockup.html`.
   **Espera mi aprobación** antes de seguir. El mockup.html debe ser usado con Lavish
3. Delega al **engineer** con `docs/features/<slug>/`.
4. Delega al **reviewer**. Si la feature toca rutas públicas, auth, billing,
   invitaciones o datos de pacientes, delega también al **security-reviewer**.
5. Si alguno devuelve `CAMBIOS REQUERIDOS` o hallazgos CRÍTICO/ALTO, pásaselos
   al engineer y vuelve al paso 4. Máximo 2 vueltas; si siguen fallando,
   detente y muéstrame los hallazgos.
6. Delega al **e2e-tester** con los flujos afectados.
7. Resume: qué cambió, qué verificó cada agente y qué quedó sin verificar.
   **No hagas commit ni push.**