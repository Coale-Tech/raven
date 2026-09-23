package raven.thecommit.company;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.PorterDuff;
import android.graphics.PorterDuffXfermode;
import android.service.notification.StatusBarNotification;
import androidx.core.app.NotificationCompat;
import androidx.core.app.Person;
import androidx.core.graphics.drawable.IconCompat;
import com.getcapacitor.JSObject;
import java.util.Collections;
import java.util.Iterator;
import java.util.List;

/**
 * Chat-style notification: the site as the header, the sender's avatar per message,
 * and one conversation's messages stacked. Posted by the notification service for a push
 * the app draws, and by the page for a push that belongs to another saved site.
 */
final class ConversationNotification {
    private ConversationNotification() {}

    // Runs on the notification service's thread; the avatar download blocks it, never the alert.
    static void post(Context context, JSObject options) {
        String tag = options.getString("tag");
        int id = (int) (System.currentTimeMillis() % Integer.MAX_VALUE);
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        List<NotificationCompat.MessagingStyle.Message> history = history(manager, tag);
        String image = options.getString("image");
        Bitmap avatar = AvatarCache.cached(context, image);
        show(context, manager, options, tag, id, history, avatar, false);
        // A face that has to be fetched arrives after the notification, and updates it in place.
        if (avatar != null) return;
        Bitmap fetched = AvatarCache.fetch(context, image);
        if (fetched != null) show(context, manager, options, tag, id, history, fetched, true);
    }

    private static void show(
        Context context,
        NotificationManager manager,
        JSObject options,
        String tag,
        int id,
        List<NotificationCompat.MessagingStyle.Message> history,
        Bitmap avatar,
        boolean update
    ) {
        // MessagingStyle needs a named device user; only the senders' messages are shown.
        NotificationCompat.MessagingStyle style = new NotificationCompat.MessagingStyle(new Person.Builder().setName("You").build())
            .setConversationTitle(options.getString("site"))
            .setGroupConversation(true);
        for (NotificationCompat.MessagingStyle.Message message : history) style.addMessage(message);
        Person.Builder sender = new Person.Builder().setName(options.getString("title", ""));
        Bitmap round = circle(avatar);
        if (round != null) sender.setIcon(IconCompat.createWithBitmap(round));
        style.addMessage(options.getString("body", ""), System.currentTimeMillis(), sender.build());
        Notification notification = new NotificationCompat.Builder(context, RavenApplication.MESSAGES_CHANNEL)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setStyle(style)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            // The face arriving must not sound a second time for the same message.
            .setOnlyAlertOnce(update)
            .setContentIntent(tapIntent(context, id, options.getJSObject("data")))
            .build();
        // (tag, 0) is the identity FCM posts under, so a tagged post replaces the
        // background entry for the same conversation as well as an earlier re-post.
        manager.notify(tag, tag != null ? 0 : id, notification);
    }

    // Same extras as an FCM tap, so the messaging plugin reports notificationActionPerformed.
    private static PendingIntent tapIntent(Context context, int id, JSObject data) {
        Intent tap = new Intent(context, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        tap.putExtra("google.message_id", "raven-" + id);
        if (data != null) {
            for (Iterator<String> keys = data.keys(); keys.hasNext();) {
                String key = keys.next();
                tap.putExtra(key, data.getString(key));
            }
        }
        return PendingIntent.getActivity(context, id, tap, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    /** The messages already in the tray for this tag, so a new one stacks on them. */
    private static List<NotificationCompat.MessagingStyle.Message> history(NotificationManager manager, String tag) {
        if (tag != null) {
            for (StatusBarNotification shown : manager.getActiveNotifications()) {
                if (!tag.equals(shown.getTag())) continue;
                NotificationCompat.MessagingStyle style = NotificationCompat.MessagingStyle.extractMessagingStyleFromNotification(shown.getNotification());
                if (style != null) return style.getMessages();
            }
        }
        return Collections.emptyList();
    }

    private static Bitmap circle(Bitmap source) {
        if (source == null) return null;
        int size = Math.min(source.getWidth(), source.getHeight());
        Bitmap out = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(out);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        canvas.drawCircle(size / 2f, size / 2f, size / 2f, paint);
        paint.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.SRC_IN));
        canvas.drawBitmap(source, (size - source.getWidth()) / 2f, (size - source.getHeight()) / 2f, paint);
        return out;
    }

}
