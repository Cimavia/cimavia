import { createAthleteFeedbackApi, createCoachFeedbackApi } from "@cmv/shared";
import { api } from "@/shared/lib/api";

/**
 * Les DEUX surfaces du débrief, injectées avec le client web.
 *
 * Ce ne sont pas deux copies d'un même appel : l'athlète ÉCRIT sous `/me/scheduled-sessions/:id`
 * (`@Roles([ATHLETE])`), le coach LIT sous `/feedbacks` (`@Roles([COACH])`). Deux contrôleurs,
 * deux gardes — et depuis #30, deux modules partagés que le mobile appelle aussi.
 */
export const coachFeedbackApi = createCoachFeedbackApi(api);
export const athleteFeedbackApi = createAthleteFeedbackApi(api);

export { coachFeedbackKeys, myFeedbackKeys } from "@cmv/shared";
