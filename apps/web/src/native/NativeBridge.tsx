import { useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { isRootPath, registerAndroidBack } from "./back"
import { subscribeLinkClicks } from "./links"
import { trackKeyboardInset } from "./keyboard"
import { takePendingPath } from "./pending"
import { openNotificationTarget, subscribeForeignSiteNotifications, subscribeNotificationTaps } from "./push"
import { subscribeShareDelivery } from "./shareIn"

/** Listeners that need the router: back, push taps, foreign pushes, share delivery, link clicks. */
export default function NativeBridge() {
    const navigate = useNavigate()

    useEffect(() => {
        let disposed = false
        // Flows that finish after an unmount route through this.
        const go = (path: string) => { if (!disposed) navigate(path) }
        // Browser router at /: the location is the route, read at press time so nothing re-renders here.
        const unBack = registerAndroidBack(() => isRootPath(window.location.pathname), () => navigate("/"))
        const unLinks = subscribeLinkClicks(navigate)
        const unKeyboard = trackKeyboardInset()
        const unTap = subscribeNotificationTaps((data) => { openNotificationTarget(data, go).catch(() => { }) })
        const unForeign = subscribeForeignSiteNotifications()
        const unShare = subscribeShareDelivery(go)
        takePendingPath().then((path) => path && go(path))
        return () => { disposed = true; unBack(); unLinks(); unKeyboard(); unTap(); unForeign(); unShare() }
    }, [navigate])

    return null
}
