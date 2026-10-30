---
name: feature
description: Flujo completo para construir una feature de WizyDoc con los subagentes, de plan a pruebas. Úsalo cuando el usuario escriba /feature o pida construir una feature de punta a punta.
---
Para la feature descrita en $ARGUMENTS:

Trabaja en una rama del ticket creada desde `origin/main`. Si te pedí un
worktree, todo lo que sigue, incluido el plan, ocurre dentro de él.

1. Delega al **planner**. Si devuelve preguntas abiertas, muéstramelas,
   espera mis respuestas y vuelve a delegarle con ellas. El plan no incluye
   pasos en producción.
2. Muéstrame `docs/features/<slug>/plan.md` y, si existe, `mockup.html`.
   **Espera mi aprobación** antes de seguir. El mockup.html debe ser usado con Lavish
3. Delega al **product-manager** para que escriba los criterios de aceptación
   en el plan, marcando con `[e2e]` sólo los flujos principales, los permisos
   y la seguridad.
   La primera parte del plan (sólo `docs/features/<slug>/`) va en su propio PR.
   Los pasos 4 a 8 se repiten por cada parte siguiente, en orden.
4. Delega al **engineer** con `docs/features/<slug>/` y la parte que toca.
5. Delega al **reviewer**. Si la feature toca rutas públicas, auth, billing,
   invitaciones o datos de pacientes, delega también al **security-reviewer**.
6. Si alguno devuelve `CAMBIOS REQUERIDOS` o hallazgos CRÍTICO/ALTO, pásaselos
   al engineer y vuelve al paso 5. Máximo 2 vueltas; si siguen fallando,
   detente y muéstrame los hallazgos.
7. Delega al **e2e-tester** con los criterios `[e2e]` y los flujos afectados.
   Si después sólo cambian tipos o comentarios, no repitas la ronda.
8. Si se cumple la definición de "terminado" de `AGENTS.md`, haz commit en la
   rama de la parte, push y abre su PR con `gh pr create` (apilado con
   `gh stack` si depende de otra parte sin mergear). **No hagas merge.**
9. Resume: qué cambió, qué verificó cada agente, qué quedó sin verificar y el
   link del PR.