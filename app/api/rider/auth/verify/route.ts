import { NextResponse } from 'next/server';

export async function POST() {
    return NextResponse.json({
        error: 'This OTP sign-in is retired. Use /rider/dashboard with your approved phone number and PIN.'
    }, { status: 410 });
}
