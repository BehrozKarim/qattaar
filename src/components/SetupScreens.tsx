import { ArrowLeftIcon, ArrowRightIcon, GlobeHemisphereWestIcon, PlusIcon, RobotIcon, SignInIcon, UsersIcon } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import type { Difficulty } from '../game/ai';
import { VARIANTS } from '../game/variants';
import type { Variant } from '../game/variants';
import type { LocalMode } from '../hooks/useLocalGame';
import { VariantPicker } from './VariantPicker';

export type Mode = LocalMode | 'online';
const MODE_NAMES: Record<Mode, string> = { ai: 'Play the computer', local: 'Pass & play', online: 'Play a friend' };

export function SetupScreen({ title, detail, step, onBack, children, busy = false }: { title: string; detail: string; step: string; onBack(): void; children: ReactNode; busy?: boolean }) {
  return <section className="setup-screen"><button className="text-button back-button" onClick={onBack} disabled={busy}><ArrowLeftIcon size={18} aria-hidden="true" />Back</button><span className="eyebrow">{step}</span><h1>{title}</h1><p className="screen-intro">{detail}</p>{children}</section>;
}

export function ModeScreen({ onChoose, onResume, resumeLabel }: { onChoose(mode: Mode): void; onResume?: () => void; resumeLabel: string }) {
  return <section className="welcome-screen"><span className="eyebrow">THE BALOCHI GAME OF LINES</span><h1>Your next move<br />starts here.</h1><p className="screen-intro">Nine pieces. Three in a row. Choose how you’d like to play.</p><div className="mode-choices">
    {([{ mode: 'ai', detail: 'Find your level. Play anytime.', Icon: RobotIcon }, { mode: 'local', detail: 'Two players, one screen.', Icon: UsersIcon }, { mode: 'online', detail: 'A private room for you and a friend.', Icon: GlobeHemisphereWestIcon }] as const).map(({ mode, detail, Icon }) => <button className="choice-button" key={mode} onClick={() => onChoose(mode)}><Icon size={28} weight="duotone" aria-hidden="true" /><span><strong>{MODE_NAMES[mode]}</strong><small>{detail}</small></span><ArrowRightIcon size={20} aria-hidden="true" /></button>)}
  </div>{onResume && <button className="resume-button secondary-button" onClick={onResume}>Resume game<span>{resumeLabel}</span><ArrowRightIcon size={18} aria-hidden="true" /></button>}<p className="welcome-note">Known as Qattaar in Balochi.<br />A game of lines, patience, and seeing what comes next.</p></section>;
}

export function LocalSetup({ mode, variant, difficulty, onVariant, onDifficulty, onStart, onBack }: { mode: LocalMode; variant: Variant; difficulty: Difficulty; onVariant(variant: Variant): void; onDifficulty(level: Difficulty): void; onStart(): void; onBack(): void }) {
  return <SetupScreen title={MODE_NAMES[mode]} step="SET UP YOUR GAME" detail={mode === 'ai' ? 'Choose your rules and a challenge that suits you.' : 'Set the rules, then pass the screen between turns.'} onBack={onBack}><VariantPicker variant={variant} disabled={false} inRoom={false} onChange={onVariant} />{mode === 'ai' && <div className="difficulty-section"><label id="difficulty-label">Choose your challenge</label><div className="difficulty-control" role="group" aria-labelledby="difficulty-label">{(['easy', 'medium', 'hard'] as const).map((level) => <button key={level} aria-pressed={difficulty === level} className={difficulty === level ? 'selected-level' : ''} onClick={() => onDifficulty(level)}>{level}</button>)}</div><p>{difficulty === 'easy' ? 'A little room to learn and experiment.' : difficulty === 'medium' ? 'A thoughtful challenge. Stay one move ahead.' : 'Thinks further ahead. Make every stone count.'}</p></div>}<button className="primary-button setup-submit" onClick={onStart}>Start game<ArrowRightIcon size={18} aria-hidden="true" /></button><p className="field-hint">{VARIANTS[variant].shortName} rules · White goes first</p></SetupScreen>;
}

export function OnlineChoices({ onCreate, onJoin, disabled }: { onCreate(): void; onJoin(): void; disabled: boolean }) {
  return <div className="mode-choices"><button className="choice-button" disabled={disabled} onClick={onCreate}><PlusIcon size={26} aria-hidden="true" /><span><strong>Create a room</strong><small>Choose the rules and invite a friend.</small></span><ArrowRightIcon size={20} aria-hidden="true" /></button><button className="choice-button" disabled={disabled} onClick={onJoin}><SignInIcon size={26} aria-hidden="true" /><span><strong>Join a room</strong><small>Have a code? Take your seat.</small></span><ArrowRightIcon size={20} aria-hidden="true" /></button></div>;
}
