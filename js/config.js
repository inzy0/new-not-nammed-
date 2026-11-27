// Site configuration the owner fills in. Leaving a value empty keeps that feature in its "not set up yet" state.
export const CONFIG = {
  // Google OAuth client ID (Web application) from the owner's Google Cloud console.
  // Enables "Sign in with Google" + sending Studio sources to the user's own Google Drive for NotebookLM.
  // Authorised JavaScript origin to add in Google Cloud: https://inzy0.github.io
  googleClientId: '',
  notebookLmUrl: 'https://notebooklm.google.com/',
  driveFolderName: 'Evidara → NotebookLM',
  // URL of the deployed Evidara AI Worker (see worker/README.md), e.g. https://evidara-ai.<you>.workers.dev
  aiWorkerUrl: '',
  // URL of the deployed Evidara API (worker/), e.g. https://evidara-api.<you>.workers.dev. Turns on accounts,
  // verification, publishing, discussion, likes, follows, library sync, shared videos and AI images for everyone.
  apiUrl: '',
  // Local testing only: show the test sign-in form (works only if the server has DEV_LOGIN on).
  devLogin: false,
};
