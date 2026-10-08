package com.onlinebar.waitlist;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.Intent;
import android.os.Bundle;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;

public final class WidgetConfigureActivity extends Activity {
    private int appWidgetId = AppWidgetManager.INVALID_APPWIDGET_ID;
    private EditText referralCodeInput;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setResult(RESULT_CANCELED);
        appWidgetId = getIntent().getIntExtra(
                AppWidgetManager.EXTRA_APPWIDGET_ID,
                AppWidgetManager.INVALID_APPWIDGET_ID
        );
        if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
            finish();
            return;
        }

        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        int padding = dp(24);
        content.setPadding(padding, padding, padding, padding);

        TextView title = new TextView(this);
        title.setText("Set up your launch widget");
        title.setTextSize(20);
        content.addView(title);

        TextView instructions = new TextView(this);
        instructions.setText("Enter your invite code to show real joined-friend and token totals. You can also add it later by joining through the Online Bar app.");
        instructions.setTextSize(14);
        LinearLayout.LayoutParams instructionsParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        instructionsParams.topMargin = dp(12);
        content.addView(instructions, instructionsParams);

        referralCodeInput = new EditText(this);
        referralCodeInput.setSingleLine(true);
        referralCodeInput.setHint("OB-XXXXXXXX");
        referralCodeInput.setInputType(0x00000001);
        String savedCode = getSharedPreferences(WaitlistWidgetProvider.PREFERENCES, MODE_PRIVATE)
                .getString(WaitlistWidgetProvider.REFERRAL_CODE, "");
        referralCodeInput.setText(savedCode);
        LinearLayout.LayoutParams inputParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        inputParams.topMargin = dp(14);
        content.addView(referralCodeInput, inputParams);

        Button save = new Button(this);
        save.setText("SAVE WIDGET");
        LinearLayout.LayoutParams buttonParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        buttonParams.topMargin = dp(12);
        content.addView(save, buttonParams);
        save.setOnClickListener(view -> saveWidget());

        setContentView(content);
    }

    private void saveWidget() {
        String code = referralCodeInput.getText().toString().trim();
        if (!code.isEmpty() && !code.matches("(?i)[a-z0-9-]{4,40}")) {
            referralCodeInput.setError("Enter a valid invite code.");
            return;
        }
        if (!code.isEmpty()) {
            getSharedPreferences(WaitlistWidgetProvider.PREFERENCES, MODE_PRIVATE)
                    .edit()
                    .putString(WaitlistWidgetProvider.REFERRAL_CODE, code)
                    .apply();
        } else {
            getSharedPreferences(WaitlistWidgetProvider.PREFERENCES, MODE_PRIVATE)
                    .edit()
                    .remove(WaitlistWidgetProvider.REFERRAL_CODE)
                    .apply();
        }
        Intent result = new Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
        setResult(RESULT_OK, result);
        WaitlistWidgetProvider.requestRefresh(this);
        finish();
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
