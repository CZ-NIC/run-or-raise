export const DBUS = `
<node>
    <interface name="org.gnome.Shell.Extensions.RunOrRaise">
        <method name="Call">
            <arg type="s" name="line" direction="in"/>
            <arg type="s" name="response" direction="out"/>
        </method>
    </interface>
</node>
`;