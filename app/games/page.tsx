import { redirect } from 'next/navigation';

export default function GameNightPage() {
  redirect('/card-games?mode=do-or-drink');
}
