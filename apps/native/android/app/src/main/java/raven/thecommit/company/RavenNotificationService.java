package raven.thecommit.company;

import com.getcapacitor.JSObject;
import com.google.firebase.messaging.RemoteMessage;
import io.capawesome.capacitorjs.plugins.firebase.messaging.MessagingService;
import java.util.Map;

/**
 * Draws the chat-style notification for a push the site sent without a title, which
 * Android hands to the app instead of drawing itself (raven/notification.py).
 * While the page is listening it decides what to show, so nothing is drawn here.
 */
public class RavenNotificationService extends MessagingService {

    @Override
    public void onMessageReceived(RemoteMessage message) {
        super.onMessageReceived(message);
        Map<String, String> data = message.getData();
        String title = data.get("push_title");
        if (title == null || title.isEmpty() || RavenApplication.pageHandlesNotifications()) return;
        String workspace = data.get("workspace");
        String workspaceImage = data.get("workspace_image");
        // A channel is headed by its workspace: two workspaces can name a channel the same.
        String header = empty(workspace) ? data.get("sitename") : workspace + " · " + data.get("sitename");
        // A channel wears its workspace's logo; a direct message wears the sender's face.
        String face = empty(workspaceImage) ? data.get("image") : workspaceImage;
        JSObject options = new JSObject();
        options.put("title", title);
        options.put("body", data.get("push_body"));
        options.put("site", header);
        options.put("image", face);
        options.put("tag", data.get("tag"));
        JSObject payload = new JSObject();
        for (Map.Entry<String, String> entry : data.entrySet()) payload.put(entry.getKey(), entry.getValue());
        options.put("data", payload);
        ConversationNotification.post(this, options);
    }

    private static boolean empty(String value) {
        return value == null || value.isEmpty();
    }
}
