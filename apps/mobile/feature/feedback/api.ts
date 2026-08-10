import { createAthleteFeedbackApi, createCoachFeedbackApi } from "@cmv/shared";
import { api } from "@/shared/lib/api";

/**
 * Les DEUX surfaces du débrief, injectées avec le client mobile — l'athlète écrit sous `/me`
 * (`@Roles([ATHLETE])`), le coach lit sous `/feedbacks` (`@Roles([COACH])`). Deux contrôleurs,
 * deux gardes ; c'est l'écran qui n'appelle que la sienne.
 */
export const athleteFeedbackApi = createAthleteFeedbackApi(api);
export const coachFeedbackApi = createCoachFeedbackApi(api);

export { coachFeedbackKeys, myFeedbackKeys } from "@cmv/shared";
