import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import FeedbackQA from './feedback';

createRoot(document.getElementById('root')!).render(<StrictMode><FeedbackQA /></StrictMode>);
